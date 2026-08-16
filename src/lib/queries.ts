import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/workspace.functions";
import { getPersonaId, useDemoPersonaId } from "@/lib/demo";


export type KpiRow = Record<string, unknown> & {
  id: string;
  name: string;
  description: string | null;
  rubric_id: string | null;
  status: string;
  kpi_type: string;
  perspective: string;
  weight_percent: number;
  target_value: number | null;
  unit: string | null;
  period_start: string;
  period_end: string;
  employee_id: string;
  reviewer_id: string | null;
  approver_id: string | null;
  department_id: string | null;
  milestones: unknown;
  score_records: ScoreRow[];
  actual_entries: ActualRow[];
  employees: { id: string; name: string; department_id?: string | null; designation?: string | null } | null;
  reviewer: { id: string; name: string } | null;
  approver: { id: string; name: string } | null;
};

export type ScoreRow = {
  id: string;
  version_number: number;
  calculated_score: number | null;
  achievement_percent: number | null;
  adjustment_delta: number;
  adjustment_reason_code: string | null;
  adjustment_justification: string | null;
  final_score: number | null;
  calculation_trace: Record<string, unknown> | null;
  approved_at: string | null;
  approved_by: string | null;
  reviewed_by: string | null;
};

export type ActualRow = {
  id: string;
  actual_value: number | null;
  rubric_level: number | null;
  data_source_type: string;
  reporting_date: string;
  comments: string | null;
  entered_at: string;
  evidence: {
    id: string;
    file_name: string | null;
    file_hash: string;
    file_size: number | null;
    description: string | null;
  }[];
};

export type EmployeeLite = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string | null;
  manager_id: string | null;
  designation?: string | null;
  is_demo?: boolean;
};

export type AuditRow = Record<string, unknown> & {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  timestamp: string;
  reason: string | null;
  before_value: unknown;
  after_value: unknown;
};

export type Workspace = {
  me: EmployeeLite;
  personas: EmployeeLite[];
  employees: EmployeeLite[];
  departments: { id: string; name: string }[];
  rubrics: { id: string; name: string; levels: unknown }[];
  policies: { department_id: string | null; achievement_floor: number; achievement_cap: number; adjustment_escalation_threshold: number }[];
  kpis: KpiRow[];
  audit: AuditRow[];
};

export function latestScore(kpi: { score_records?: ScoreRow[] }): ScoreRow | null {
  const rows = [...(kpi.score_records ?? [])].sort((a, b) => b.version_number - a.version_number);
  return rows[0] ?? null;
}

export function latestActual(kpi: { actual_entries?: ActualRow[] }): ActualRow | null {
  const rows = [...(kpi.actual_entries ?? [])].sort((a, b) => b.entered_at.localeCompare(a.entered_at));
  return rows[0] ?? null;
}

export const WORKSPACE_STALE_TIME = 5 * 60_000;
const WORKSPACE_CACHE_TTL = 30 * 60_000;

const cacheKey = (personaId: string | null) => `kpiflow.workspace.${personaId ?? "self"}`;

/** Last known workspace, kept in localStorage so the first screen after login paints instantly. */
function readCachedWorkspace(personaId: string | null): { data: Workspace; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(personaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Workspace; at: number };
    if (!parsed?.data || Date.now() - parsed.at > WORKSPACE_CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedWorkspace(personaId: string | null, data: Workspace) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(personaId), JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* quota or private mode — the cache is only an optimisation */
  }
}

/** Shared query config so every caller (and every prefetch) hits the same cache entry. */
export function workspaceQueryOptions(personaId: string | null) {
  const cached = readCachedWorkspace(personaId);
  return {
    queryKey: ["workspace", personaId] as const,
    queryFn: async () => {
      const workspace = (await getWorkspace()) as unknown as Workspace;
      writeCachedWorkspace(personaId, workspace);
      return workspace;
    },
    staleTime: WORKSPACE_STALE_TIME,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    ...(cached ? { initialData: cached.data, initialDataUpdatedAt: cached.at } : {}),
  };
}

/**
 * Starts the workspace read as early as possible (e.g. straight after sign-in) so the
 * first authenticated screen renders from cache instead of waiting on a round trip.
 */
export function prefetchWorkspace(queryClient: QueryClient, personaId: string | null = getPersonaId()) {
  return queryClient.prefetchQuery(workspaceQueryOptions(personaId)).catch(() => undefined);
}

/** Single server-side read that respects the active persona's role. */
export function useWorkspace() {
  const personaId = useDemoPersonaId();
  return useQuery({
    ...workspaceQueryOptions(personaId),
    placeholderData: keepPreviousData,
  });
}



export function useKpis(filter?: { employeeId?: string; reviewerId?: string }) {
  const { data, isLoading, error } = useWorkspace();
  const kpis = useMemo(() => {
    let rows = data?.kpis ?? [];
    if (filter?.employeeId) rows = rows.filter((k) => k.employee_id === filter.employeeId);
    if (filter?.reviewerId) rows = rows.filter((k) => k.reviewer_id === filter.reviewerId);
    return rows;
  }, [data?.kpis, filter?.employeeId, filter?.reviewerId]);
  return { data: kpis, isLoading, error };
}

export function useKpi(id: string) {
  const { data, isLoading, error } = useWorkspace();
  return { data: (data?.kpis ?? []).find((k) => k.id === id) ?? null, isLoading, error };
}

export function useEmployees() {
  const { data, isLoading } = useWorkspace();
  return { data: data?.employees ?? [], isLoading };
}

export function useDepartments() {
  const { data, isLoading } = useWorkspace();
  return { data: data?.departments ?? [], isLoading };
}

export function usePolicy() {
  const { data } = useWorkspace();
  return { data: (data?.policies ?? []).find((p) => p.department_id === null) ?? null };
}

export function useRubrics() {
  const { data } = useWorkspace();
  return { data: data?.rubrics ?? [] };
}

export function useAuditLog(entityId?: string) {
  const { data, isLoading } = useWorkspace();
  const rows = useMemo(() => {
    const all = data?.audit ?? [];
    return entityId ? all.filter((a) => a.entity_id === entityId) : all;
  }, [data?.audit, entityId]);
  return { data: rows, isLoading };
}

/** Live refresh: any change to the scoring tables invalidates the workspace read. */
export function useRealtimeKpis() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["workspace"] });
    const channel = supabase
      .channel("kpiflow-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "kpi_definitions" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "score_records" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "actual_entries" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
