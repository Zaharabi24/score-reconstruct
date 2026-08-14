import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Paperclip, FileText } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { latestActual, latestScore, useAuditLog, useKpis, useRealtimeKpis, type KpiRow } from "@/lib/queries";
import { weightedRollUp } from "@/lib/scoring";
import { getEvidenceLink, getReportPayload } from "@/lib/kpi.functions";
import { buildKpiReport } from "@/lib/report";
import { AuditTrail } from "@/components/AuditTrail";
import { EmployeeTabs } from "@/components/EmployeeTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

function periodLabel(iso: string) {
  const d = new Date(iso);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

function Summary() {
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: kpis } = useKpis(me ? { employeeId: me.id } : undefined);
  const { data: audit } = useAuditLog();
  const reportFn = useServerFn(getReportPayload);

  const periods = useMemo(() => {
    const set = [...new Set((kpis ?? []).map((k) => k.period_start))].sort();
    return { current: set[set.length - 1] ?? null, previous: set.length > 1 ? set[set.length - 2] : null };
  }, [kpis]);

  const build = (list: KpiRow[]) =>
    list.map((kpi) => {
      const score = latestScore(kpi);
      const actual = latestActual(kpi);
      return {
        kpi,
        final: score?.final_score ?? null,
        achievement: score?.achievement_percent ?? null,
        actual: actual?.actual_value ?? null,
        rubricLevel: actual?.rubric_level ?? null,
      };
    });

  const currentRows = build((kpis ?? []).filter((k) => !periods.current || k.period_start === periods.current));
  const previousRows = build((kpis ?? []).filter((k) => periods.previous && k.period_start === periods.previous));

  const rollUp = (list: ReturnType<typeof build>) =>
    weightedRollUp(
      list
        .filter((r) => r.final !== null)
        .map((r) => ({ weight_percent: Number(r.kpi.weight_percent), final_score: Number(r.final) })),
    );

  const overall = rollUp(currentRows);
  const previousOverall = rollUp(previousRows);
  const delta = overall !== null && previousOverall !== null ? overall - previousOverall : null;
  const approved = currentRows.filter((r) => r.final !== null);

  const avgAchievement = useMemo(() => {
    const list = currentRows.filter((r) => r.achievement !== null).map((r) => Number(r.achievement));
    return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
  }, [currentRows]);

  const prevByName = new Map(previousRows.map((r) => [r.kpi.name, r]));

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
            {periods.current ? `${periodLabel(periods.current)} · ` : ""}weighted roll-up of approved scores only — pending
            KPIs are excluded until approval.
          </p>
        </div>
        <Button variant="outline" onClick={download}>
          <Download className="mr-1 h-4 w-4" /> Download performance record
        </Button>
      </div>

      <EmployeeTabs />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total KPI score" value={overall === null ? "—" : overall.toFixed(1)} hint="Weighted across approved KPIs" />
        <Stat label="Average achievement" value={avgAchievement === null ? "—" : `${avgAchievement}%`} hint="Actual vs target" />
        <Stat
          label="Previous period"
          value={previousOverall === null ? "—" : previousOverall.toFixed(1)}
          hint={
            delta === null
              ? periods.previous
                ? `${periodLabel(periods.previous)} — not comparable yet`
                : "No earlier period on record"
              : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} vs ${periodLabel(periods.previous!)}`
          }
        />
        <Stat
          label="Approved KPIs"
          value={`${approved.length}/${currentRows.length}`}
          hint={`${approved.reduce((sum, r) => sum + Number(r.kpi.weight_percent), 0)}% of weight approved`}
        />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-5 py-2 font-medium">KPI</th>
              <th className="whitespace-nowrap px-5 py-2 text-center font-medium">Status</th>
              <th className="whitespace-nowrap px-5 py-2 text-right font-medium">Target</th>
              <th className="whitespace-nowrap px-5 py-2 text-right font-medium">Actual</th>
              <th className="whitespace-nowrap px-5 py-2 text-right font-medium">Achievement</th>
              <th className="whitespace-nowrap px-5 py-2 text-right font-medium">Weight</th>
              <th className="whitespace-nowrap px-5 py-2 text-right font-medium">Score</th>
              <th className="whitespace-nowrap px-5 py-2 text-center font-medium">Evidence</th>
              <th className="whitespace-nowrap px-5 py-2 font-medium">Reporting date</th>
              <th className="whitespace-nowrap px-5 py-2 text-center font-medium">Approval</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row) => {
              const { kpi, final, achievement, actual, rubricLevel } = row;
              const entry = latestActual(kpi);
              return (
                <tr key={kpi.id} className="border-t border-border">
                  <td className="px-5 py-2">{kpi.name}</td>
                  <td className="px-5 py-2 text-center">
                    <StatusBadge status={kpi.status} />
                  </td>
                  <td className="num px-5 py-2 text-right">
                    {kpi.target_value === null ? "Rubric" : `${kpi.target_value}${kpi.unit ? ` ${kpi.unit}` : ""}`}
                  </td>
                  <td className="num px-5 py-2 text-right">
                    {actual !== null
                      ? `${actual}${kpi.unit ? ` ${kpi.unit}` : ""}`
                      : rubricLevel !== null
                        ? `Level ${rubricLevel}`
                        : "—"}
                  </td>
                  <td className="num px-5 py-2 text-right">{achievement === null ? "—" : `${Number(achievement).toFixed(0)}%`}</td>
                  <td className="num px-5 py-2 text-right">{kpi.weight_percent}%</td>
                  <td className="num px-5 py-2 text-right">{final ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-2 text-center">
                    <EvidenceCell kpi={kpi} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-2">
                    {entry ? format(new Date(entry.entered_at), "d MMM, HH:mm") : "—"}
                  </td>
                  <td className="px-5 py-2 text-center">
                    <ApprovalPill status={kpi.status} />
                  </td>
                </tr>
              );
            })}
            {!currentRows.length && (
              <tr>
                <td colSpan={10} className="px-5 py-6 text-sm text-muted-foreground">
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

