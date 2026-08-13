import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PERSONA_HEADER } from "./demo";
import { calculateScore, type Milestone, type ScoringPolicy } from "./scoring";

export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string | null;
  manager_id: string | null;
};

export async function getEmployee(userId: string): Promise<EmployeeRow> {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("id,name,email,role,department_id,manager_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No employee profile found for this account");
  return data as EmployeeRow;
}

export async function logAudit(entry: {
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  before_value?: unknown;
  after_value?: unknown;
  reason?: string | null;
  employee_id?: string | null;
}) {
  await supabaseAdmin.from("audit_log").insert({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    before_value: (entry.before_value ?? null) as never,
    after_value: (entry.after_value ?? null) as never,
    reason: entry.reason ?? null,
    employee_id: entry.employee_id ?? null,
  });
}

/** Denies an action, writing the denial itself to the immutable audit log. */
export async function deny(
  actor: EmployeeRow,
  action: string,
  reason: string,
  entityId: string | null = null,
  entityType = "kpi_definitions",
): Promise<never> {
  await logAudit({
    entity_type: entityType,
    entity_id: entityId,
    action: `denied:${action}`,
    actor_id: actor.id,
    actor_role: actor.role,
    reason,
  });
  throw new Error(`Not permitted: ${reason}`);
}

export async function getPolicy(departmentId: string | null): Promise<ScoringPolicy> {
  const { data } = await supabaseAdmin
    .from("scoring_policy")
    .select("department_id,achievement_floor,achievement_cap,adjustment_escalation_threshold");
  const rows = data ?? [];
  const scoped = rows.find((r) => r.department_id === departmentId);
  const org = rows.find((r) => r.department_id === null);
  const row = scoped ?? org;
  return {
    achievement_floor: Number(row?.achievement_floor ?? 70),
    achievement_cap: Number(row?.achievement_cap ?? 120),
    adjustment_escalation_threshold: Number(row?.adjustment_escalation_threshold ?? 10),
  };
}

export async function getKpi(kpiId: string) {
  const { data, error } = await supabaseAdmin
    .from("kpi_definitions")
    .select("*")
    .eq("id", kpiId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("KPI not found");
  return data;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_target_approval"],
  pending_target_approval: ["active", "draft"],
  active: ["submitted"],
  submitted: ["approved", "returned"],
  returned: ["submitted"],
  approved: ["correction_requested"],
  correction_requested: ["approved"],
};

export function assertTransition(from: string, to: string) {
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`Illegal workflow transition: ${from} -> ${to}`);
  }
}

export async function latestScore(kpiId: string) {
  const { data } = await supabaseAdmin
    .from("score_records")
    .select("*")
    .eq("kpi_definition_id", kpiId)
    .order("version_number", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/** The single authoritative code path for computing a score. */
export async function runCalculateScore(kpiId: string, actorId: string | null) {
  const kpi = await getKpi(kpiId);
  const policy = await getPolicy(kpi.department_id);

  const { data: actuals } = await supabaseAdmin
    .from("actual_entries")
    .select("*")
    .eq("kpi_definition_id", kpiId)
    .order("entered_at", { ascending: false })
    .limit(1);
  const actual = actuals?.[0] ?? null;

  const result = calculateScore({
    kpiType: kpi.kpi_type as never,
    target: kpi.target_value === null ? null : Number(kpi.target_value),
    actual: actual?.actual_value === null || actual?.actual_value === undefined ? null : Number(actual.actual_value),
    milestones: (kpi.milestones as unknown as Milestone[] | null) ?? null,
    rubricLevel: actual?.rubric_level ?? null,
    policy,
  });

  const prior = await latestScore(kpiId);
  const version = prior ? Number(prior.version_number) + 1 : 1;

  const { data: inserted, error } = await supabaseAdmin
    .from("score_records")
    .insert({
      kpi_definition_id: kpiId,
      version_number: version,
      calculated_score: result.system_score,
      achievement_percent: result.achievement_percent,
      final_score: null,
      calculation_trace: {
        ...result.trace,
        actual_entry_id: actual?.id ?? null,
        computed_at: new Date().toISOString(),
        computed_by: "server:calculate-score",
      } as never,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logAudit({
    entity_type: "score_records",
    entity_id: inserted.id,
    action: "score_calculated",
    actor_id: actorId,
    actor_role: "system",
    after_value: inserted,
    employee_id: kpi.employee_id,
    reason: "Server-side scoring engine",
  });

  return inserted;
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function base64ToBytes(base64: string) {
  const clean = base64.includes(",") ? (base64.split(",")[1] ?? "") : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function assertWeightBudget(employeeId: string, weight: number, periodStart: string) {
  const { data } = await supabaseAdmin
    .from("kpi_definitions")
    .select("weight_percent,status")
    .eq("employee_id", employeeId)
    .eq("period_start", periodStart);
  const allocated = (data ?? [])
    .filter((r) => r.status !== "draft")
    .reduce((s, r) => s + Number(r.weight_percent), 0);
  if (allocated + weight > 100) {
    throw new Error(
      `Weight allocation exceeded: ${allocated}% already allocated for this period, ${weight}% requested (max 100%).`,
    );
  }
  return allocated + weight;
}

/* ────────────────────────────────────────────────────────────────
   Demo personas + workspace reads
   ──────────────────────────────────────────────────────────────── */

export const KPI_SELECT =
  "*, employees:employee_id(id,name,email,department_id,designation), reviewer:reviewer_id(id,name), approver:approver_id(id,name), score_records(*), actual_entries(*, evidence(*))";

/**
 * The acting employee for a request. In demo mode an authenticated presenter can
 * act as one of the seeded demo employees (is_demo = true) via a request header.
 */
export async function resolveActor(userId: string, personaId?: string | null): Promise<EmployeeRow> {
  if (DEMO_MODE && personaId) {
    const { data } = await supabaseAdmin
      .from("employees")
      .select("id,name,email,role,department_id,manager_id")
      .eq("id", personaId)
      .eq("is_demo", true)
      .maybeSingle();
    if (data) return data as EmployeeRow;
  }
  return getEmployee(userId);
}

export const DEMO_MODE = true;

/** The four canonical demo personas, one per role, in presentation order. */
const PERSONA_EMAILS = [
  "employee@anwarkpiflow.demo",
  "manager@anwarkpiflow.demo",
  "hradmin@anwarkpiflow.demo",
  "executive@anwarkpiflow.demo",
];

export async function listPersonas() {
  const { data } = await supabaseAdmin
    .from("employees")
    .select("id,name,email,role,department_id,manager_id")
    .in("email", PERSONA_EMAILS);
  const rows = (data ?? []) as EmployeeRow[];
  return PERSONA_EMAILS.map((email) => rows.find((r) => r.email === email)).filter(Boolean) as EmployeeRow[];
}


/** Everything the signed-in persona is allowed to see, read server-side in one round trip. */
export async function loadWorkspace(actor: EmployeeRow) {
  const [employeesRes, departmentsRes, rubricsRes, policyRes] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id,name,email,role,department_id,manager_id,designation,is_demo")
      .order("name"),
    supabaseAdmin.from("departments").select("id,name,parent_department_id").order("name"),
    supabaseAdmin.from("rubrics").select("*").order("created_at"),
    supabaseAdmin.from("scoring_policy").select("*"),
  ]);

  const employees = employeesRes.data ?? [];
  const orgWide = ["hr_admin", "executive"].includes(actor.role);
  const teamIds = employees.filter((e) => e.manager_id === actor.id).map((e) => e.id);

  let kpiQuery = supabaseAdmin.from("kpi_definitions").select(KPI_SELECT).order("created_at", { ascending: false });
  if (!orgWide) {
    const visible = Array.from(new Set([actor.id, ...teamIds]));
    kpiQuery = kpiQuery.or(
      `employee_id.in.(${visible.join(",")}),reviewer_id.eq.${actor.id},approver_id.eq.${actor.id}`,
    );
  }
  const { data: kpis, error } = await kpiQuery;
  if (error) throw new Error(error.message);

  let auditQuery = supabaseAdmin
    .from("audit_log")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(500);
  if (!orgWide) {
    const visible = Array.from(new Set([actor.id, ...teamIds, ...(kpis ?? []).map((k) => k.employee_id)]));
    auditQuery = auditQuery.in("employee_id", visible);
  }
  const { data: audit } = await auditQuery;

  return {
    me: actor,
    employees,
    departments: departmentsRes.data ?? [],
    rubrics: rubricsRes.data ?? [],
    policies: policyRes.data ?? [],
    kpis: kpis ?? [],
    audit: audit ?? [],
  };
}

/** Reads the demo persona the presenter selected, if any. */
export function personaFromRequest(): string | null {
  try {
    return getRequestHeader(PERSONA_HEADER) ?? null;
  } catch {
    return null;
  }
}
