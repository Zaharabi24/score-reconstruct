import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertTransition,
  assertWeightBudget,
  base64ToBytes,
  deny,
  personaFromRequest,
  resolveActor,
  getKpi,
  getPolicy,
  latestScore,
  logAudit,
  runCalculateScore,
  sha256Hex,
} from "./kpi.server";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveActor(context.userId, personaFromRequest()));

export const setupKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        employee_id: z.string().uuid(),
        name: z.string().min(2),
        description: z.string().optional().nullable(),
        kpi_type: z.enum(["higher_is_better", "lower_is_better", "milestone", "qualitative"]),
        target_value: z.number().nullable().optional(),
        unit: z.string().optional().nullable(),
        weight_percent: z.number().gt(0).max(100),
        period_start: z.string(),
        period_end: z.string(),
        perspective: z.enum(["financial", "customer", "operational", "people"]),
        reviewer_id: z.string().uuid(),
        approver_id: z.string().uuid(),
        rubric_id: z.string().uuid().nullable().optional(),
        milestones: z
          .array(z.object({ label: z.string(), weight: z.number(), due_date: z.string().nullable().optional() }))
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    if (actor.role !== "hr_admin") {
      await deny(actor, "setup-kpi", "Only HR admins can create KPI definitions");
    }
    const allocated = await assertWeightBudget(data.employee_id, data.weight_percent, data.period_start);

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("department_id")
      .eq("id", data.employee_id)
      .maybeSingle();

    const { data: inserted, error } = await supabaseAdmin
      .from("kpi_definitions")
      .insert({
        employee_id: data.employee_id,
        department_id: employee?.department_id ?? null,
        name: data.name,
        description: data.description ?? null,
        kpi_type: data.kpi_type,
        target_value: data.target_value ?? null,
        unit: data.unit ?? null,
        weight_percent: data.weight_percent,
        period_start: data.period_start,
        period_end: data.period_end,
        perspective: data.perspective,
        reviewer_id: data.reviewer_id,
        approver_id: data.approver_id,
        rubric_id: data.rubric_id ?? null,
        status: "pending_target_approval",
        milestones: (data.milestones
          ? data.milestones.map((m) => ({ ...m, completed: false, evidence_id: null }))
          : null) as never,
        created_by: actor.id,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({
      entity_type: "kpi_definitions",
      entity_id: inserted.id,
      action: "kpi_created",
      actor_id: actor.id,
      actor_role: actor.role,
      after_value: inserted,
      employee_id: inserted.employee_id,
      reason: "KPI routed for target approval",
    });

    return { kpi: inserted, allocated_weight: allocated };
  });

export const approveTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        kpi_definition_id: z.string().uuid(),
        approve: z.boolean(),
        rejection_reason: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    const kpi = await getKpi(data.kpi_definition_id);

    if (kpi.reviewer_id !== actor.id) {
      await deny(actor, "approve-target", "Only the assigned reviewer can approve this target", kpi.id);
    }
    if (!data.approve && !data.rejection_reason) throw new Error("A rejection reason is required");

    const next = data.approve ? "active" : "draft";
    assertTransition(kpi.status, next);

    const { data: updated, error } = await supabaseAdmin
      .from("kpi_definitions")
      .update({ status: next })
      .eq("id", kpi.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({
      entity_type: "kpi_definitions",
      entity_id: kpi.id,
      action: data.approve ? "target_approved" : "target_rejected",
      actor_id: actor.id,
      actor_role: actor.role,
      before_value: kpi,
      after_value: updated,
      employee_id: kpi.employee_id,
      reason: data.rejection_reason ?? "Target approved by reviewer",
    });

    return updated;
  });

export const submitActual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        kpi_definition_id: z.string().uuid(),
        actual_value: z.number().nullable().optional(),
        rubric_level: z.number().int().min(1).max(5).nullable().optional(),
        reporting_date: z.string(),
        comments: z.string().optional().nullable(),
        data_source_type: z.enum(["system_verified", "verified_manual", "unverified"]),
        completed_milestones: z.array(z.number()).optional().nullable(),
        evidence: z
          .object({
            file_name: z.string(),
            content_base64: z.string(),
            description: z.string().optional().nullable(),
          })
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    const kpi = await getKpi(data.kpi_definition_id);

    if (kpi.employee_id !== actor.id) {
      await deny(actor, "submit-actual", "Only the KPI owner can submit an actual value", kpi.id);
    }
    if (!["active", "returned"].includes(kpi.status)) {
      throw new Error(`Actuals can only be submitted while a KPI is active or returned (current: ${kpi.status})`);
    }
    if (data.data_source_type !== "system_verified" && !data.evidence) {
      throw new Error("Evidence is required for manually reported actuals");
    }

    if (kpi.kpi_type === "milestone" && data.completed_milestones) {
      const list = ((kpi.milestones as unknown as Record<string, unknown>[]) ?? []).map((m, i) => ({
        ...m,
        completed: data.completed_milestones!.includes(i),
      }));
      if (list.some((m) => m.completed) && !data.evidence) {
        throw new Error("Each completed milestone requires supporting evidence");
      }
      await supabaseAdmin.from("kpi_definitions").update({ milestones: list as never }).eq("id", kpi.id);
    }

    const { data: entry, error: entryError } = await supabaseAdmin
      .from("actual_entries")
      .insert({
        kpi_definition_id: kpi.id,
        actual_value: data.actual_value ?? null,
        rubric_level: data.rubric_level ?? null,
        data_source_type: data.data_source_type,
        reporting_date: data.reporting_date,
        comments: data.comments ?? null,
        entered_by: actor.id,
      })
      .select("*")
      .single();
    if (entryError) throw new Error(entryError.message);

    let evidenceRow = null;
    if (data.evidence) {
      const bytes = base64ToBytes(data.evidence.content_base64);
      const hash = await sha256Hex(bytes);
      const path = `${kpi.employee_id}/${kpi.id}/${entry.id}-${data.evidence.file_name}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("evidence")
        .upload(path, bytes, { contentType: "application/octet-stream", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: ev, error: evError } = await supabaseAdmin
        .from("evidence")
        .insert({
          actual_entry_id: entry.id,
          file_url: path,
          file_name: data.evidence.file_name,
          file_hash: hash,
          file_size: bytes.length,
          uploaded_by: actor.id,
          description: data.evidence.description ?? null,
        })
        .select("*")
        .single();
      if (evError) throw new Error(evError.message);
      evidenceRow = ev;

      await logAudit({
        entity_type: "evidence",
        entity_id: ev.id,
        action: "evidence_uploaded",
        actor_id: actor.id,
        actor_role: actor.role,
        after_value: { file_name: ev.file_name, file_hash: ev.file_hash, file_size: ev.file_size },
        employee_id: kpi.employee_id,
      });
    }

    const score = await runCalculateScore(kpi.id, actor.id);

    assertTransition(kpi.status, "submitted");
    await supabaseAdmin.from("kpi_definitions").update({ status: "submitted" }).eq("id", kpi.id);

    return {
      achievement_percent: score.achievement_percent,
      calculated_score: score.calculated_score,
      evidence: evidenceRow,
      entry,
    };
  });

export const reviewDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        kpi_definition_id: z.string().uuid(),
        decision: z.enum(["approve", "adjust", "return"]),
        adjustment_delta: z.number().optional().nullable(),
        adjustment_reason_code: z.string().optional().nullable(),
        adjustment_justification: z.string().optional().nullable(),
        return_reason: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    const kpi = await getKpi(data.kpi_definition_id);
    const isSeniorStep = kpi.status === "correction_requested";

    if (isSeniorStep ? kpi.approver_id !== actor.id : kpi.reviewer_id !== actor.id) {
      await deny(actor, "review-decision", "You are not the assigned reviewer for this KPI", kpi.id);
    }
    if (!["submitted", "correction_requested"].includes(kpi.status)) {
      throw new Error(`This KPI is not awaiting review (current status: ${kpi.status})`);
    }

    if (data.decision === "return") {
      if (!data.return_reason) throw new Error("A reason is required when returning a KPI");
      assertTransition(kpi.status, "returned");
      const { data: updated } = await supabaseAdmin
        .from("kpi_definitions")
        .update({ status: "returned" })
        .eq("id", kpi.id)
        .select("*")
        .single();
      await logAudit({
        entity_type: "kpi_definitions",
        entity_id: kpi.id,
        action: "returned_for_clarification",
        actor_id: actor.id,
        actor_role: actor.role,
        before_value: kpi,
        after_value: updated,
        reason: data.return_reason,
        employee_id: kpi.employee_id,
      });
      return { status: "returned" as const };
    }

    let score = await latestScore(kpi.id);
    if (!score) throw new Error("No calculated score exists for this KPI");

    if (isSeniorStep) {
      const { data: newVersion, error } = await supabaseAdmin
        .from("score_records")
        .insert({
          kpi_definition_id: kpi.id,
          version_number: Number(score.version_number) + 1,
          calculated_score: score.calculated_score,
          achievement_percent: score.achievement_percent,
          calculation_trace: score.calculation_trace,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      score = newVersion;
    }

    let delta = 0;
    if (data.decision === "adjust") {
      delta = Number(data.adjustment_delta ?? 0);
      if (!delta) throw new Error("An adjustment requires a non-zero delta");
      if (!data.adjustment_reason_code || !data.adjustment_justification) {
        throw new Error("An adjustment requires both a reason code and a written justification");
      }
      const policy = await getPolicy(kpi.department_id);
      if (Math.abs(delta) > policy.adjustment_escalation_threshold && !isSeniorStep) {
        await supabaseAdmin
          .from("score_records")
          .update({
            adjustment_delta: delta,
            adjustment_reason_code: data.adjustment_reason_code,
            adjustment_justification: data.adjustment_justification,
            reviewed_by: actor.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", score.id);
        assertTransition(kpi.status, "correction_requested");
        await supabaseAdmin
          .from("kpi_definitions")
          .update({ status: "correction_requested" })
          .eq("id", kpi.id);
        await logAudit({
          entity_type: "kpi_definitions",
          entity_id: kpi.id,
          action: "adjustment_escalated",
          actor_id: actor.id,
          actor_role: actor.role,
          after_value: { adjustment_delta: delta, threshold: policy.adjustment_escalation_threshold },
          reason: data.adjustment_justification,
          employee_id: kpi.employee_id,
        });
        return { status: "correction_requested" as const, escalated: true };
      }
    }

    const finalScore = Number(score.calculated_score ?? 0) + delta;
    const now = new Date().toISOString();
    const { data: updatedScore, error: scoreError } = await supabaseAdmin
      .from("score_records")
      .update({
        adjustment_delta: delta,
        adjustment_reason_code: data.adjustment_reason_code ?? null,
        adjustment_justification: data.adjustment_justification ?? null,
        final_score: Math.round(finalScore * 100) / 100,
        reviewed_by: actor.id,
        reviewed_at: now,
        approved_by: actor.id,
        approved_at: now,
      })
      .eq("id", score.id)
      .select("*")
      .single();
    if (scoreError) throw new Error(scoreError.message);

    assertTransition(kpi.status, "approved");
    await supabaseAdmin.from("kpi_definitions").update({ status: "approved" }).eq("id", kpi.id);

    await logAudit({
      entity_type: "kpi_definitions",
      entity_id: kpi.id,
      action: data.decision === "adjust" ? "approved_with_adjustment" : "approved_as_calculated",
      actor_id: actor.id,
      actor_role: actor.role,
      before_value: { status: kpi.status, calculated_score: score.calculated_score },
      after_value: updatedScore,
      reason: data.adjustment_justification ?? "Approved as calculated",
      employee_id: kpi.employee_id,
    });

    return { status: "approved" as const, final_score: updatedScore.final_score };
  });

export const requestCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ kpi_definition_id: z.string().uuid(), reason: z.string().min(5) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    if (actor.role !== "executive") {
      await deny(actor, "request-correction", "Only executives can reopen an approved score", data.kpi_definition_id);
    }
    const kpi = await getKpi(data.kpi_definition_id);
    assertTransition(kpi.status, "correction_requested");
    await supabaseAdmin
      .from("kpi_definitions")
      .update({ status: "correction_requested" })
      .eq("id", kpi.id);
    await logAudit({
      entity_type: "kpi_definitions",
      entity_id: kpi.id,
      action: "correction_requested",
      actor_id: actor.id,
      actor_role: actor.role,
      before_value: { status: kpi.status },
      after_value: { status: "correction_requested" },
      reason: data.reason,
      employee_id: kpi.employee_id,
    });
    return { status: "correction_requested" as const };
  });

export const getEvidenceLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ evidence_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin
      .from("evidence")
      .select("id,file_url")
      .eq("id", data.evidence_id)
      .maybeSingle();
    if (!allowed) return { url: null, reason: "Evidence not found or not visible to you" };
    const { data: signed, error } = await supabaseAdmin.storage
      .from("evidence")
      .createSignedUrl(allowed.file_url, 300);
    if (error || !signed?.signedUrl) {
      // Demo/seeded evidence rows reference files that were never uploaded.
      return { url: null, reason: "This evidence file is not available (demo record has no stored file)." };
    }
    return { url: signed.signedUrl, reason: null };
  });

export const getReportPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ kpi_definition_id: z.string().uuid().optional(), employee_id: z.string().uuid().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin;
    let kpiQuery = client
      .from("kpi_definitions")
      .select("*, employees:employee_id(name,email), score_records(*), actual_entries(*, evidence(*))");
    if (data.kpi_definition_id) kpiQuery = kpiQuery.eq("id", data.kpi_definition_id);
    if (data.employee_id) kpiQuery = kpiQuery.eq("employee_id", data.employee_id);
    const { data: kpis, error } = await kpiQuery;
    if (error) throw new Error(error.message);

    const ids = (kpis ?? []).map((k) => k.id);
    const { data: audit } = await client
      .from("audit_log")
      .select("*")
      .in("entity_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("timestamp", { ascending: true });

    return { kpis: kpis ?? [], audit: audit ?? [], generated_at: new Date().toISOString() };
  });

export const runErpSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    if (!["hr_admin", "executive"].includes(actor.role)) {
      await deny(actor, "erp-sync", "Only HR admins or executives can run the ERP sync");
    }
    const { data: kpis } = await supabaseAdmin
      .from("kpi_definitions")
      .select("id,target_value,kpi_type,status")
      .in("status", ["active", "returned"])
      .in("kpi_type", ["higher_is_better", "lower_is_better"]);

    let synced = 0;
    for (const kpi of kpis ?? []) {
      const target = Number(kpi.target_value ?? 0);
      if (!target) continue;
      const mockActual = Math.round(target * (0.75 + Math.random() * 0.5) * 100) / 100;
      await supabaseAdmin.from("actual_entries").insert({
        kpi_definition_id: kpi.id,
        actual_value: mockActual,
        data_source_type: "system_verified",
        reporting_date: new Date().toISOString().slice(0, 10),
        comments: "Imported by the ERP/Sales feed adapter (mock source)",
        entered_by: actor.id,
      });
      await runCalculateScore(kpi.id, actor.id);
      await supabaseAdmin.from("kpi_definitions").update({ status: "submitted" }).eq("id", kpi.id);
      synced++;
    }
    return { synced };
  });

export const exportDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ format: z.enum(["csv", "json"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = await resolveActor(context.userId, personaFromRequest());
    if (!["hr_admin", "executive"].includes(actor.role)) {
      await deny(actor, "export-dataset", "Only HR admins or executives can export the org dataset");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("kpi_definitions")
      .select("id,name,kpi_type,perspective,weight_percent,target_value,unit,status,period_start,period_end,employees:employee_id(name,department_id),score_records(version_number,achievement_percent,calculated_score,adjustment_delta,final_score,approved_at)");
    if (error) throw new Error(error.message);

    const flat = (rows ?? []).map((r) => {
      const scores = (r.score_records ?? []) as { version_number: number }[];
      const latest = scores.sort((a, b) => b.version_number - a.version_number)[0] as
        | Record<string, unknown>
        | undefined;
      return {
        kpi_id: r.id,
        employee: (r.employees as { name?: string } | null)?.name ?? "",
        kpi: r.name,
        type: r.kpi_type,
        perspective: r.perspective,
        weight_percent: r.weight_percent,
        target: r.target_value,
        unit: r.unit,
        status: r.status,
        period_start: r.period_start,
        period_end: r.period_end,
        achievement_percent: latest?.["achievement_percent"] ?? "",
        calculated_score: latest?.["calculated_score"] ?? "",
        adjustment_delta: latest?.["adjustment_delta"] ?? "",
        final_score: latest?.["final_score"] ?? "",
        approved_at: latest?.["approved_at"] ?? "",
      };
    });

    if (data.format === "json") return { content: JSON.stringify(flat, null, 2), mime: "application/json" };
    const headers = Object.keys(flat[0] ?? { kpi_id: "" });
    const csv = [
      headers.join(","),
      ...flat.map((row) =>
        headers.map((h) => `"${String((row as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    return { content: csv, mime: "text/csv" };
  });
