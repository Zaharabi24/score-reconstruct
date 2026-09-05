import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_kpi",
  title: "Get KPI detail",
  description:
    "Return one KPI with its reported actuals, evidence file names and the latest score record (achievement, calculated and final score).",
  inputSchema: { kpi_id: z.string().uuid().describe("The KPI definition id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kpi_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const [kpiRes, actualsRes, scoresRes] = await Promise.all([
      supabase.from("kpi_definitions").select("*").eq("id", kpi_id).maybeSingle(),
      supabase
        .from("actual_entries")
        .select("id,actual_value,comment,reported_at,evidence(file_name,uploaded_at)")
        .eq("kpi_definition_id", kpi_id)
        .order("reported_at", { ascending: false }),
      supabase
        .from("score_records")
        .select(
          "id,version_number,achievement_percent,calculated_score,adjustment_delta,adjustment_justification,final_score,reviewed_at,approved_at,created_at",
        )
        .eq("kpi_definition_id", kpi_id)
        .order("version_number", { ascending: false }),
    ]);

    const error = kpiRes.error ?? actualsRes.error ?? scoresRes.error;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!kpiRes.data)
      return { content: [{ type: "text", text: "KPI not found, or not visible to this account." }], isError: true };

    const payload = {
      kpi: kpiRes.data,
      actuals: actualsRes.data ?? [],
      scores: scoresRes.data ?? [],
      latest_score: scoresRes.data?.[0] ?? null,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  },
});
