import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

type ScoreRow = {
  kpi_definition_id: string;
  version_number: number;
  achievement_percent: number | null;
  final_score: number | null;
};

export default defineTool({
  name: "performance_summary",
  title: "Performance summary",
  description:
    "Weighted performance summary for the signed-in user: total weighted score, average achievement and a per-KPI breakdown.",
  inputSchema: {
    period_start: z.string().optional().describe("ISO date; only KPIs whose period ends on or after it."),
    period_end: z.string().optional().describe("ISO date; only KPIs whose period starts on or before it."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_start, period_end }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;

    let kpiQuery = supabase
      .from("kpi_definitions")
      .select("id,name,kpi_type,status,target_value,unit,weight_percent,period_start,period_end")
      .eq("employee_id", userId);
    if (period_start) kpiQuery = kpiQuery.gte("period_end", period_start);
    if (period_end) kpiQuery = kpiQuery.lte("period_start", period_end);

    const { data: kpis, error } = await kpiQuery;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const ids = (kpis ?? []).map((k) => k.id);

    let scores: ScoreRow[] = [];
    if (ids.length) {
      const { data, error: scoreError } = await supabase
        .from("score_records")
        .select("kpi_definition_id,version_number,achievement_percent,final_score")
        .in("kpi_definition_id", ids)
        .order("version_number", { ascending: false });
      if (scoreError) return { content: [{ type: "text", text: scoreError.message }], isError: true };
      scores = (data ?? []) as ScoreRow[];
    }

    const latest = new Map<string, ScoreRow>();
    for (const row of scores) if (!latest.has(row.kpi_definition_id)) latest.set(row.kpi_definition_id, row);

    const breakdown = (kpis ?? []).map((kpi) => {
      const score = latest.get(kpi.id) ?? null;
      return {
        ...kpi,
        achievement_percent: score?.achievement_percent ?? null,
        final_score: score?.final_score ?? null,
      };
    });

    const scored = breakdown.filter((b) => b.final_score !== null);
    const totalWeightedScore = Number(
      scored.reduce((sum, b) => sum + (b.final_score ?? 0) * (b.weight_percent / 100), 0).toFixed(2),
    );
    const achieved = breakdown.filter((b) => b.achievement_percent !== null);
    const averageAchievement = achieved.length
      ? Number((achieved.reduce((s, b) => s + (b.achievement_percent ?? 0), 0) / achieved.length).toFixed(1))
      : null;

    const payload = {
      kpi_count: breakdown.length,
      scored_count: scored.length,
      total_weight_percent: breakdown.reduce((s, b) => s + b.weight_percent, 0),
      total_weighted_score: totalWeightedScore,
      average_achievement_percent: averageAchievement,
      kpis: breakdown,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  },
});
