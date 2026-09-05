import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_kpis",
  title: "List KPIs",
  description:
    "List the KPIs visible to the signed-in user, optionally filtered by status or by a period the KPI overlaps.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Filter by KPI status, e.g. draft, submitted, reviewed, approved."),
    period_start: z.string().optional().describe("ISO date; only KPIs whose period ends on or after it."),
    period_end: z.string().optional().describe("ISO date; only KPIs whose period starts on or before it."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, period_start, period_end, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("kpi_definitions")
      .select(
        "id,name,kpi_type,perspective,status,target_value,unit,weight_percent,period_start,period_end,employee_id",
      )
      .order("period_start", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status);
    if (period_start) query = query.gte("period_end", period_start);
    if (period_end) query = query.lte("period_start", period_end);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { kpis: data ?? [] },
    };
  },
});
