import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  ACHIEVEMENT_MAX,
  BAND_BG,
  BAND_LABEL,
  BAND_TEXT,
  BAND_TINT,
  achievementOf,
  bandOf,
  barWidth,
  fmtPct,
} from "@/lib/bands";
import type { EmployeeLite, KpiRow } from "@/lib/queries";

const SCORED_STATUSES = ["approved", "submitted", "correction_requested"];
const PENDING_STATUS_META: {
  key: string;
  label: string;
  className: string;
  dotClassName: string;
  tintClassName: string;
  hint: string;
  needsAction?: boolean;
}[] = [
  {
    key: "active",
    label: "awaiting actual",
    className: "bg-muted-foreground/50",
    dotClassName: "bg-muted-foreground/50",
    tintClassName: "hover:bg-muted focus-visible:bg-muted",
    hint: "Employee hasn't submitted a result yet",
  },
  {
    key: "submitted",
    label: "pending your review",
    className: "bg-attention",
    dotClassName: "bg-attention",
    tintClassName: "hover:bg-attention/10 focus-visible:bg-attention/10",
    hint: "Submitted with evidence, waiting on your decision",
    needsAction: true,
  },
  {
    key: "correction_requested",
    label: "pending final approval",
    className: "bg-exceptional",
    dotClassName: "bg-exceptional",
    tintClassName: "hover:bg-exceptional/10 focus-visible:bg-exceptional/10",
    hint: "Adjusted score awaiting your final sign-off",
  },
  {
    key: "returned",
    label: "returned",
    className: "bg-destructive",
    dotClassName: "bg-destructive",
    tintClassName: "hover:bg-destructive/10 focus-visible:bg-destructive/10",
    hint: "Sent back for clarification, waiting on employee",
  },
  {
    key: "pending_target_approval",
    label: "target pending",
    className: "bg-primary/60",
    dotClassName: "bg-primary/60",
    tintClassName: "hover:bg-primary/10 focus-visible:bg-primary/10",
    hint: "Target needs your approval before tracking starts",
  },
  {
    key: "draft",
    label: "in draft",
    className: "bg-border",
    dotClassName: "bg-border",
    tintClassName: "hover:bg-muted focus-visible:bg-muted",
    hint: "Not yet issued to the employee",
  },
];


/** Process/admin KPIs are excluded from people-performance lists. */
function isPeopleKpi(kpi: KpiRow, teamIds: Set<string>) {
  return teamIds.has(kpi.employee_id);
}

export function DepartmentOverview({
  kpis,
  team,
  periodStart,
  previousPeriodKpis,
  departmentName,
  onFilterStatus,
}: {
  kpis: KpiRow[];
  team: EmployeeLite[];
  periodStart: string | null;
  previousPeriodKpis: KpiRow[];
  departmentName: string;
  onFilterStatus?: (status: string) => void;
}) {

  const teamIds = useMemo(() => new Set(team.map((e) => e.id)), [team]);
  const peopleKpis = useMemo(() => kpis.filter((k) => isPeopleKpi(k, teamIds)), [kpis, teamIds]);

  const scored = peopleKpis.filter((k) => SCORED_STATUSES.includes(k.status) && achievementOf(k) !== null);
  const average = scored.length
    ? scored.reduce((sum, k) => sum + (achievementOf(k) ?? 0), 0) / scored.length
    : null;

  const priorScored = previousPeriodKpis.filter(
    (k) => teamIds.has(k.employee_id) && achievementOf(k) !== null,
  );
  const priorAverage = priorScored.length
    ? priorScored.reduce((sum, k) => sum + (achievementOf(k) ?? 0), 0) / priorScored.length
    : null;
  const delta = average !== null && priorAverage !== null ? average - priorAverage : null;

  // Per-employee rollups (average achievement + weight-scored total for tie-breaks)
  const people = team
    .map((e) => {
      const rows = scored.filter((k) => k.employee_id === e.id);
      if (!rows.length) return null;
      const avg = rows.reduce((s, k) => s + (achievementOf(k) ?? 0), 0) / rows.length;
      const weighted = rows.reduce((s, k) => s + (achievementOf(k) ?? 0) * Number(k.weight_percent), 0);
      return { employee: e, avg, weighted, count: rows.length };
    })
    .filter(Boolean) as { employee: EmployeeLite; avg: number; weighted: number; count: number }[];

  const ranked = [...people].sort((a, b) => b.avg - a.avg || b.weighted - a.weighted);
  const top = ranked.slice(0, 3);
  const bottom = [...ranked].reverse().slice(0, 3);

  const pending = peopleKpis.filter((k) => k.status !== "approved");
  const pendingCounts = PENDING_STATUS_META.map((meta) => ({
    ...meta,
    count: pending.filter((k) => k.status === meta.key).length,
  })).filter((s) => s.count > 0);

  const belowTarget = scored
    .map((k) => ({ kpi: k, pct: achievementOf(k) as number }))
    .filter((row) => row.pct < 95)
    .sort((a, b) => a.pct - b.pct);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Department overview</h2>
        <p className="text-xs text-muted-foreground">
          {departmentName} · period{" "}
          <span className="num">{periodStart ?? "—"}</span> · {team.length} team members
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AverageAchievement average={average} delta={delta} hasPrior={priorAverage !== null} />
        <Performers top={top} bottom={bottom} />
        <PendingEvaluations total={pending.length} segments={pendingCounts} onFilterStatus={onFilterStatus} />
        <BelowTarget rows={belowTarget} previousPeriodKpis={previousPeriodKpis} />
      </div>
    </section>
  );
}

function AverageAchievement({
  average,
  delta,
  hasPrior,
}: {
  average: number | null;
  delta: number | null;
  hasPrior: boolean;
}) {
  const band = bandOf(average ?? 0);
  return (
    <div className="panel p-6">
      <p className="field-label">Average achievement</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <span className={`num text-[34px] font-semibold leading-none ${average === null ? "" : BAND_TEXT[band]}`}>
          {average === null ? "—" : `${average.toFixed(1)}%`}
        </span>
        {hasPrior && delta !== null ? (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              delta >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            {delta >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            <span className="num">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>{" "}
            pts vs last period
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Minus className="h-3.5 w-3.5" /> First period tracked
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-alt" role="img"
          aria-label={`Average achievement ${average === null ? "not available" : `${average.toFixed(1)} percent`}`}>
          <div className={`h-full rounded-full ${BAND_BG[band]}`} style={{ width: barWidth(average ?? 0) }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span className="num">0%</span>
          <span>{average === null ? "No scored KPIs yet" : BAND_LABEL[band]}</span>
          <span className="num">{ACHIEVEMENT_MAX}%</span>
        </div>
      </div>
    </div>
  );
}

function Performers({
  top,
  bottom,
}: {
  top: { employee: EmployeeLite; avg: number }[];
  bottom: { employee: EmployeeLite; avg: number }[];
}) {
  return (
    <div className="panel p-6">
      <p className="field-label">High / low performers</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <MiniList title="Top performers" rows={top} empty="No scored KPIs yet" />
        <MiniList title="Needs attention" rows={bottom} empty="No scored KPIs yet" />
      </div>
    </div>
  );
}

function MiniList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { employee: EmployeeLite; avg: number }[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold">{title}</p>
      <ul className="mt-3 space-y-3">
        {!rows.length && <li className="text-xs text-muted-foreground">{empty}</li>}
        {rows.map(({ employee, avg }) => {
          const band = bandOf(avg);
          return (
            <li key={employee.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium">{employee.name}</span>
                <span className={`num text-[13px] ${BAND_TEXT[band]}`}>{avg.toFixed(1)}%</span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">{employee.designation ?? "Team member"}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                <div className={`h-full rounded-full ${BAND_BG[band]}`} style={{ width: barWidth(avg) }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type PendingSegment = {
  key: string;
  label: string;
  className: string;
  dotClassName: string;
  tintClassName: string;
  hint: string;
  needsAction?: boolean;
  count: number;
};

function PendingEvaluations({
  total,
  segments,
  onFilterStatus,
}: {
  total: number;
  segments: PendingSegment[];
  onFilterStatus?: ((status: string) => void) | undefined;
}) {
  const pctOf = (count: number) => (total ? (count / total) * 100 : 0);
  const narrow = segments.filter((s) => pctOf(s.count) < 12 && s.count > 0);

  return (
    <div className="panel p-6">
      <p className="field-label">Pending evaluations</p>
      <p className="num mt-2 text-[34px] font-semibold leading-none">{total}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">across your department this period</p>

      {/* labels for segments too narrow to hold a number inside the bar */}
      {narrow.length > 0 && (
        <div className="relative mt-4 h-5 w-full">
          {segments.reduce<{ acc: number; nodes: ReactNode[] }>(
            (state, s) => {
              const w = pctOf(s.count);
              if (w > 0 && w < 12) {
                state.nodes.push(
                  <span
                    key={s.key}
                    className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${state.acc + w / 2}%` }}
                  >
                    <span className="num text-[11px] text-muted-foreground">{s.count}</span>
                    <span className={`h-2 w-px ${s.dotClassName}`} />
                  </span>,
                );
              }
              state.acc += w;
              return state;
            },
            { acc: 0, nodes: [] },
          ).nodes}
        </div>
      )}

      <div
        className="mt-2 flex h-4 w-full overflow-hidden rounded-full bg-surface-alt"
        role="img"
        aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ") || "No pending evaluations"}
      >
        {segments.map((s) => {
          const w = pctOf(s.count);
          return (
            <div
              key={s.key}
              className={`flex items-center justify-center ${s.className}`}
              style={{ width: `${w}%` }}
              title={`${s.count} ${s.label}`}
            >
              {w >= 12 && (
                <span className="num text-[10px] font-semibold text-background">{s.count}</span>
              )}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 space-y-2">
        {!segments.length && (
          <li className="text-xs text-muted-foreground">Every KPI in this department is locked.</li>
        )}
        {segments.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onFilterStatus?.(s.key)}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.tintClassName}`}
            >
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.dotClassName}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px]">
                    <span className="num font-semibold">{s.count}</span> {s.label}
                  </span>
                  {s.needsAction && (
                    <span className="rounded-full border border-attention/30 bg-attention/10 px-2 py-0.5 text-[10px] font-medium text-attention">
                      Needs your action
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

}

function BelowTarget({
  rows,
  previousPeriodKpis,
}: {
  rows: { kpi: KpiRow; pct: number }[];
  previousPeriodKpis: KpiRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, 4);

  const streak = (kpi: KpiRow) => {
    const prior = previousPeriodKpis.find((p) => p.name === kpi.name && p.employee_id === kpi.employee_id);
    const priorPct = prior ? achievementOf(prior) : null;
    return priorPct !== null && priorPct < 95 ? 2 : 1;
  };

  return (
    <div className="panel p-6">
      <p className="field-label">KPIs below target</p>
      {!rows.length && <p className="mt-3 text-sm text-muted-foreground">Every scored KPI is at or above 95%.</p>}
      <ul className="mt-4 space-y-3">
        {shown.map(({ kpi, pct }) => {
          const band = bandOf(pct);
          const consecutive = streak(kpi);
          return (
            <li key={kpi.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{kpi.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{kpi.employees?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {consecutive >= 2 && (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BAND_TINT.below}`}>
                    <span className="num">{consecutive}×</span>
                  </span>
                )}
                <span className={`num text-[13px] ${BAND_TEXT[band]}`}>{fmtPct(pct)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show fewer" : `View all (${rows.length})`}
        </button>
      )}
    </div>
  );
}
