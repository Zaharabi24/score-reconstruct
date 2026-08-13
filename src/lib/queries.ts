import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const KPI_SELECT =
  "*, employees:employee_id(id,name,email,department_id), reviewer:reviewer_id(id,name), approver:approver_id(id,name), score_records(*), actual_entries(*, evidence(*))";

export type KpiRow = Record<string, unknown> & {
  id: string;
  name: string;
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
  milestones: unknown;
  score_records: ScoreRow[];
  actual_entries: ActualRow[];
  employees: { id: string; name: string } | null;
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

export function latestScore(kpi: { score_records?: ScoreRow[] }): ScoreRow | null {
  const rows = [...(kpi.score_records ?? [])].sort((a, b) => b.version_number - a.version_number);
  return rows[0] ?? null;
}

export function latestActual(kpi: { actual_entries?: ActualRow[] }): ActualRow | null {
  const rows = [...(kpi.actual_entries ?? [])].sort((a, b) => b.entered_at.localeCompare(a.entered_at));
  return rows[0] ?? null;
}

export function useKpis(filter?: { employeeId?: string; reviewerId?: string }) {
  return useQuery({
    queryKey: ["kpis", filter?.employeeId ?? null, filter?.reviewerId ?? null],
    queryFn: async () => {
      let q = supabase.from("kpi_definitions").select(KPI_SELECT).order("created_at", { ascending: false });
      if (filter?.employeeId) q = q.eq("employee_id", filter.employeeId);
      if (filter?.reviewerId) q = q.eq("reviewer_id", filter.reviewerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as KpiRow[];
    },
  });
}

export function useKpi(id: string) {
  return useQuery({
    queryKey: ["kpi", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("kpi_definitions").select(KPI_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as KpiRow | null;
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,email,role,department_id,manager_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePolicy() {
  return useQuery({
    queryKey: ["scoring_policy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scoring_policy")
        .select("*")
        .is("department_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRubrics() {
  return useQuery({
    queryKey: ["rubrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rubrics").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAuditLog(entityId?: string) {
  return useQuery({
    queryKey: ["audit", entityId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("audit_log").select("*").order("timestamp", { ascending: false }).limit(500);
      if (entityId) q = q.eq("entity_id", entityId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Live refresh: any change to the scoring tables invalidates cached reads. */
export function useRealtimeKpis() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("kpiflow-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "kpi_definitions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kpis"] });
        queryClient.invalidateQueries({ queryKey: ["kpi"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "score_records" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kpis"] });
        queryClient.invalidateQueries({ queryKey: ["kpi"] });
        queryClient.invalidateQueries({ queryKey: ["audit"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "actual_entries" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kpis"] });
        queryClient.invalidateQueries({ queryKey: ["kpi"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
