import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listKpisTool from "./tools/list-kpis";
import getKpiTool from "./tools/get-kpi";
import performanceSummaryTool from "./tools/performance-summary";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "kpi-flow-insights",
  title: "KPI Flow Insights",
  version: "0.1.0",
  instructions:
    "Tools for Anwar KPIFlow, a variable KPI and performance management workspace. Use `whoami` for the signed-in employee, `list_kpis` to browse KPIs, `get_kpi` for one KPI with its actuals, evidence and score history, and `performance_summary` for weighted totals. All data is scoped to the connected user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listKpisTool, getKpiTool, performanceSummaryTool],
});
