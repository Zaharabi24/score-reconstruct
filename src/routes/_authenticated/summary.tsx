import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { latestScore, useAuditLog, useKpis, useRealtimeKpis } from "@/lib/queries";
import { weightedRollUp } from "@/lib/scoring";
import { getReportPayload } from "@/lib/kpi.functions";
import { buildKpiReport } from "@/lib/report";
import { AuditTrail } from "@/components/AuditTrail";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/summary")({
  head: () => ({
    meta: [
      { title: "Performance summary — Anwar KPIFlow" },
      { name: "description", content: "Weighted roll-up of approved KPI scores with a downloadable performance record." },
      { property: "og:title", content: "Performance summary — Anwar KPIFlow" },
      { property: "og:description", content: "Your weighted score, contribution per KPI and full audit history." },
    ],
  }),
  component: Summary,
});

function Summary() {
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: kpis } = useKpis(me ? { employeeId: me.id } : undefined);
  const { data: audit } = useAuditLog();
  const reportFn = useServerFn(getReportPayload);

  const rows = (kpis ?? []).map((kpi) => {
    const score = latestScore(kpi);
    return { kpi, score, final: score?.final_score ?? null };
  });
  const approved = rows.filter((r) => r.final !== null);
  const overall = weightedRollUp(
    approved.map((r) => ({ weight_percent: Number(r.kpi.weight_percent), final_score: Number(r.final) })),
  );

  const download = async () => {
    try {
      const payload = await reportFn({ data: { employee_id: me?.id } });
      buildKpiReport(payload as never, `Performance record — ${me?.name ?? ""}`).save("performance-record.pdf");
    } catch {
      toast.error("Could not generate the report");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">Performance summary</h1>
          <p className="text-sm text-muted-foreground">
            Weighted roll-up of approved scores only — pending KPIs are excluded until approval.
          </p>
        </div>
        <Button variant="outline" onClick={download}>
          <Download className="mr-1 h-4 w-4" /> Download performance record
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Overall weighted score" value={overall === null ? "—" : overall.toFixed(1)} />
        <Stat label="Approved KPIs" value={`${approved.length}/${rows.length}`} />
        <Stat
          label="Weight approved"
          value={`${approved.reduce((sum, r) => sum + Number(r.kpi.weight_percent), 0)}%`}
        />
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-medium">KPI</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 text-right font-medium">Weight</th>
              <th className="px-5 py-2 text-right font-medium">Score</th>
              <th className="px-5 py-2 text-right font-medium">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kpi, final }) => (
              <tr key={kpi.id} className="border-t border-border">
                <td className="px-5 py-2">{kpi.name}</td>
                <td className="px-5 py-2">
                  <StatusBadge status={kpi.status} />
                </td>
                <td className="num px-5 py-2 text-right">{kpi.weight_percent}%</td>
                <td className="num px-5 py-2 text-right">{final ?? "—"}</td>
                <td className="num px-5 py-2 text-right">
                  {final === null ? "—" : ((Number(final) * Number(kpi.weight_percent)) / 100).toFixed(1)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-sm text-muted-foreground">
                  No KPIs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AuditTrail rows={audit ?? []} title="Audit history" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 text-3xl">{value}</p>
    </div>
  );
}
