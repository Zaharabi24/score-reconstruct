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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
        <TooltipProvider delayDuration={150}>
          <table className="w-full min-w-[1160px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[220px]" />
              <col className="w-[130px]" />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[120px]" />
              <col className="w-[130px]" />
              <col className="w-[200px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 whitespace-nowrap bg-surface-alt px-4 py-3 text-left font-medium">KPI</th>
                <th className="whitespace-nowrap px-4 py-3 text-center font-medium">Status</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Target</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Actual</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Achievement</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Weight</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Score</th>
                <th className="whitespace-nowrap px-4 py-3 text-center font-medium">Evidence</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Reporting date</th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">Notes</th>
                <th className="whitespace-nowrap px-4 py-3 text-center font-medium">Approval</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row) => {
                const { kpi, final, achievement, actual, rubricLevel } = row;
                const entry = latestActual(kpi);
                const note = entry?.comments?.trim() || latestScore(kpi)?.adjustment_justification?.trim() || null;
                return (
                  <tr key={kpi.id} className="border-t border-border align-middle">
                    <td className="sticky left-0 z-10 bg-card px-4 py-4 align-middle">{kpi.name}</td>
                    <td className="px-4 py-4 text-center align-middle">
                      <StatusBadge status={kpi.status} className="h-6 px-2.5 text-xs leading-none" />
                    </td>
                    <td className="num px-4 py-4 text-right align-middle tabular-nums">
                      {kpi.target_value === null ? "Rubric" : `${kpi.target_value}${kpi.unit ? ` ${kpi.unit}` : ""}`}
                    </td>
                    <td className="num px-4 py-4 text-right align-middle tabular-nums">
                      {actual !== null
                        ? `${actual}${kpi.unit ? ` ${kpi.unit}` : ""}`
                        : rubricLevel !== null
                          ? `Level ${rubricLevel}`
                          : "—"}
                    </td>
                    <td className="num px-4 py-4 text-right align-middle tabular-nums">
                      {achievement === null ? "—" : `${Number(achievement).toFixed(0)}%`}
                    </td>
                    <td className="num px-4 py-4 text-right align-middle tabular-nums">{kpi.weight_percent}%</td>
                    <td className="num px-4 py-4 text-right align-middle tabular-nums">{final ?? "—"}</td>
                    <td className="px-4 py-4 text-center align-middle">
                      <EvidenceCell kpi={kpi} />
                    </td>
                    <td className="num whitespace-nowrap px-4 py-4 text-right align-middle tabular-nums">
                      {entry ? format(new Date(entry.entered_at), "d MMM, HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-4 text-left align-middle">
                      <NoteCell note={note} kpiName={kpi.name} />
                    </td>
                    <td className="px-4 py-4 text-center align-middle">
                      <ApprovalPill status={kpi.status} />
                    </td>
                  </tr>
                );
              })}
              {!currentRows.length && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-sm text-muted-foreground">
                    No KPIs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TooltipProvider>
      </div>


      <AuditTrail rows={audit ?? []} title="Audit history" />
    </div>
  );
}

/** Read-only note from the employee's submitted actual; truncated with a tooltip + click preview. */
function NoteCell({ note, kpiName }: { note: string | null; kpiName: string }) {
  const [open, setOpen] = useState(false);
  if (!note) return <span className="text-muted-foreground">—</span>;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button className="block w-full truncate rounded-sm text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {note}
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{note}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note — {kpiName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-foreground">{note}</p>
      </DialogContent>
    </Dialog>
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


const APPROVAL: Record<string, { label: string; className: string }> = {
  submitted: { label: "Pending", className: "bg-attention/10 text-attention border-attention/30" },
  pending_target_approval: { label: "Pending", className: "bg-attention/10 text-attention border-attention/30" },
  approved: { label: "Approved", className: "bg-primary text-primary-foreground border-primary" },
  returned: { label: "Returned", className: "bg-destructive/10 text-destructive border-destructive/30" },
  correction_requested: { label: "Returned", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

/** Read-only approval state for the employee view — actions stay in the manager flow. */
function ApprovalPill({ status }: { status: string }) {
  const item = APPROVAL[status];
  if (!item) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium leading-none ${item.className}`}>
      {item.label}
    </span>
  );
}

/** Evidence per KPI: attach through the existing submission flow, or preview the attached files. */
function EvidenceCell({ kpi }: { kpi: KpiRow }) {
  const evidenceLink = useServerFn(getEvidenceLink);
  const [open, setOpen] = useState(false);
  const files = (kpi.actual_entries ?? []).flatMap((entry) =>
    (entry.evidence ?? []).map((ev) => ({ ...ev, entered_at: entry.entered_at })),
  );

  const download = async (id: string) => {
    try {
      const { url, reason } = await evidenceLink({ data: { evidence_id: id } });
      if (!url) {
        toast.error(reason ?? "Could not create a download link");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Could not create a download link");
    }
  };

  if (!files.length) {
    return (
      <Link
        to="/kpi/$id"
        params={{ id: kpi.id }}
        hash="submit"
        className="inline-flex h-7 w-[104px] items-center justify-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Paperclip className="h-3.5 w-3.5" /> Attach file
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex h-7 w-[104px] items-center justify-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FileText className="h-3.5 w-3.5" /> {files.length} file{files.length > 1 ? "s" : ""}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Evidence — {kpi.name}</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {files.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{ev.file_name ?? "Evidence file"}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(ev.entered_at), "d MMM, HH:mm")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => download(ev.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
        <Link
          to="/kpi/$id"
          params={{ id: kpi.id }}
          hash="submit"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Add more evidence in the KPI detail view
        </Link>
      </DialogContent>
    </Dialog>
  );
}
