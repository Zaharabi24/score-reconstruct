import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { personaFromRequest, resolveActor } from "./kpi.server";

const MANAGEMENT = ["manager", "hr_admin", "executive"];
const SCORE_CAP = 120;

async function requireManagement(userId: string) {
  const actor = await resolveActor(userId, personaFromRequest());
  if (!MANAGEMENT.includes(actor.role)) {
    throw new Error("Project KPI is available to managers, HR admins and executives only");
  }
  return actor;
}

export type BusinessUnitCard = { id: string; name: string; ongoing_projects: number };

export type ProjectCard = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  unit: string;
  employees_tracked: number;
  avg_score: number | null;
};

export type LeaderRow = {
  member_id: string;
  name: string;
  designation: string | null;
  actual: number;
  weight_percent: number;
  score: number;
  achievement_percent: number;
  reports: { date: string; note: string }[];
  evidence: { id: string; file_name: string; file_hash: string; file_size: number | null; uploaded_at: string }[];
};

export type ProjectDetail = {
  project: { id: string; name: string; description: string | null; status: string; unit: string; business_unit: string };
  range: { from: string; to: string };
  available: { min: string; max: string } | null;
  target: number;
  actual: number;
  achievement_percent: number | null;
  rows: LeaderRow[];
};

/** Business units with a live count of their ongoing projects. */
export const listBusinessUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BusinessUnitCard[]> => {
    await requireManagement(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: units }, { data: projects }] = await Promise.all([
      supabaseAdmin.from("business_units").select("id,name").order("name"),
      supabaseAdmin.from("projects").select("id,business_unit_id,status"),
    ]);
    return (units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      ongoing_projects: (projects ?? []).filter((p) => p.business_unit_id === u.id && p.status === "ongoing").length,
    }));
  });

/** Projects for one business unit, with tracked headcount and average KPI score. */
export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ business_unit_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ProjectCard[]> => {
    await requireManagement(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id,name,description,status,unit")
      .eq("business_unit_id", data.business_unit_id)
      .order("name");
    const ids = (projects ?? []).map((p) => p.id);
    if (!ids.length) return [];
    const [{ data: members }, { data: entries }] = await Promise.all([
      supabaseAdmin.from("project_members").select("id,project_id").in("project_id", ids),
      supabaseAdmin.from("project_employee_entries").select("project_id,kpi_score").in("project_id", ids),
    ]);
    return (projects ?? []).map((p) => {
      const scores = (entries ?? []).filter((e) => e.project_id === p.id && e.kpi_score !== null);
      const avg = scores.length
        ? scores.reduce((sum, e) => sum + Number(e.kpi_score), 0) / scores.length
        : null;
      return {
        ...p,
        employees_tracked: (members ?? []).filter((m) => m.project_id === p.id).length,
        avg_score: avg === null ? null : Math.round(avg * 10) / 10,
      };
    });
  });

/**
 * Live project detail for a date or date range. Range aggregation sums targets and
 * actuals, then recomputes each member's achievement from their summed actual against
 * their weighted share of the summed target (never an average of daily scores).
 */
export const getProjectDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        project_id: z.string().uuid(),
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProjectDetail> => {
    await requireManagement(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id,name,description,status,unit,business_unit_id")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!project) throw new Error("Project not found");

    const [{ data: unitRow }, { data: allTargets }] = await Promise.all([
      supabaseAdmin.from("business_units").select("name").eq("id", project.business_unit_id).maybeSingle(),
      supabaseAdmin.from("project_targets").select("target_date,target_value").eq("project_id", project.id).order("target_date"),
    ]);

    const dates = (allTargets ?? []).map((t) => t.target_date).sort();
    const available = dates.length ? { min: dates[0]!, max: dates[dates.length - 1]! } : null;

    // Default window: the most recent 7 days of data available for this project.
    let to = data.to ?? available?.max ?? new Date().toISOString().slice(0, 10);
    let from = data.from ?? dates.slice(-7)[0] ?? to;
    if (from > to) [from, to] = [to, from];

    const [{ data: members }, { data: entries }] = await Promise.all([
      supabaseAdmin.from("project_members").select("id,name,designation,kpi_weight_percent").eq("project_id", project.id),
      supabaseAdmin
        .from("project_employee_entries")
        .select("id,member_id,entry_date,actual_value,report_note,kpi_weight_percent")
        .eq("project_id", project.id)
        .gte("entry_date", from)
        .lte("entry_date", to),
    ]);

    const entryIds = (entries ?? []).map((e) => e.id);
    const { data: evidence } = entryIds.length
      ? await supabaseAdmin
          .from("project_evidence")
          .select("id,project_employee_entry_id,file_name,file_hash,file_size,uploaded_at")
          .in("project_employee_entry_id", entryIds)
      : { data: [] as never[] };

    const target = (allTargets ?? [])
      .filter((t) => t.target_date >= from && t.target_date <= to)
      .reduce((sum, t) => sum + Number(t.target_value), 0);
    const actual = (entries ?? []).reduce((sum, e) => sum + Number(e.actual_value), 0);

    const entryMember = new Map(entryIds.map((id) => [id, (entries ?? []).find((e) => e.id === id)!.member_id]));

    const rows: LeaderRow[] = (members ?? []).map((m) => {
      const mine = (entries ?? []).filter((e) => e.member_id === m.id);
      const memberActual = mine.reduce((sum, e) => sum + Number(e.actual_value), 0);
      const weight = Number(mine[0]?.kpi_weight_percent ?? m.kpi_weight_percent);
      const share = (target * weight) / 100;
      const achievement = share > 0 ? (memberActual / share) * 100 : 0;
      return {
        member_id: m.id,
        name: m.name,
        designation: m.designation,
        actual: Math.round(memberActual * 100) / 100,
        weight_percent: weight,
        score: Math.round(Math.min(achievement, SCORE_CAP) * 10) / 10,
        achievement_percent: Math.round(achievement * 10) / 10,
        reports: mine
          .filter((e) => e.report_note)
          .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
          .map((e) => ({ date: e.entry_date, note: e.report_note as string })),
        evidence: (evidence ?? [])
          .filter((ev) => entryMember.get(ev.project_employee_entry_id) === m.id)
          .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
          .map((ev) => ({
            id: ev.id,
            file_name: ev.file_name,
            file_hash: ev.file_hash,
            file_size: ev.file_size,
            uploaded_at: ev.uploaded_at,
          })),
      };
    });

    rows.sort((a, b) => b.score - a.score);

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        unit: project.unit,
        business_unit: unitRow?.name ?? "",
      },
      range: { from, to },
      available,
      target: Math.round(target * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      achievement_percent: target > 0 ? Math.round((actual / target) * 1000) / 10 : null,
      rows,
    };
  });

/** Short-lived signed URL for a project evidence file. */
export const getProjectEvidenceLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ evidence_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireManagement(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("project_evidence")
      .select("id,file_url")
      .eq("id", data.evidence_id)
      .maybeSingle();
    if (!row) return { url: null, reason: "Evidence not found" };
    const { data: signed } = await supabaseAdmin.storage.from("evidence").createSignedUrl(row.file_url, 300);
    if (!signed?.signedUrl) {
      return { url: null, reason: "This evidence file is not available (demo record has no stored file)." };
    }
    return { url: signed.signedUrl, reason: null };
  });
