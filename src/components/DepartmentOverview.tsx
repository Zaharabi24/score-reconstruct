import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronRight, Flag, Minus, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  strokeClassName: string;
  dotClassName: string;
  tintClassName: string;
  hint: string;
  needsAction?: boolean;
}[] = [
  {
    key: "active",
    label: "awaiting actual",
    className: "bg-muted-foreground/50",
    strokeClassName: "stroke-muted-foreground/50",
    dotClassName: "bg-muted-foreground/50",
    tintClassName: "hover:bg-muted focus-visible:bg-muted",
    hint: "Employee hasn't submitted a result yet",
  },
  {
    key: "submitted",
    label: "pending your review",
    className: "bg-attention",
    strokeClassName: "stroke-attention",
    dotClassName: "bg-attention",
    tintClassName: "hover:bg-attention/10 focus-visible:bg-attention/10",
    hint: "Submitted with evidence, waiting on your decision",
    needsAction: true,
  },
  {
    key: "correction_requested",
    label: "pending final approval",
    className: "bg-exceptional",
    strokeClassName: "stroke-exceptional",
    dotClassName: "bg-exceptional",
    tintClassName: "hover:bg-exceptional/10 focus-visible:bg-exceptional/10",
    hint: "Adjusted score awaiting your final sign-off",
  },
  {
    key: "returned",
    label: "returned",
    className: "bg-destructive",
    strokeClassName: "stroke-destructive",
    dotClassName: "bg-destructive",
    tintClassName: "hover:bg-destructive/10 focus-visible:bg-destructive/10",
    hint: "Sent back for clarification, waiting on employee",
  },
  {
    key: "pending_target_approval",
    label: "target pending",
    className: "bg-primary/60",
    strokeClassName: "stroke-primary/60",
    dotClassName: "bg-primary/60",
    tintClassName: "hover:bg-primary/10 focus-visible:bg-primary/10",
    hint: "Target needs your approval before tracking starts",
  },
  {
    key: "draft",
    label: "in draft",
    className: "bg-border",
    strokeClassName: "stroke-border",
    dotClassName: "bg-border",
    tintClassName: "hover:bg-muted focus-visible:bg-muted",
    hint: "Not yet issued to the employee",
  },
];



/* ── Shared chart primitives (one visual language across the three cards) ── */

const CHART_SIZE = 168;
const CHART_RADIUS = 62;
const CHART_STROKE = 20;
const CHART_C = 2 * Math.PI * CHART_RADIUS;

type DonutSegment = { key: string; value: number; strokeClassName: string; label: string };

function Donut({ segments, children }: { segments: DonutSegment[]; children: ReactNode }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let acc = 0;
  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const frac = total ? seg.value / total : 0;
      const start = acc;
      acc += frac;
      const mid = (start + frac / 2) * 2 * Math.PI - Math.PI / 2;
      return { seg, frac, start, mid, showLabel: frac >= 0.09 };
    });

  return (
    <div className="relative mx-auto" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
      <svg width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} role="img"
        aria-label={segments.map((s) => `${s.value} ${s.label}`).join(", ")}>
        <g transform={`rotate(-90 ${CHART_SIZE / 2} ${CHART_SIZE / 2})`} fill="none" strokeWidth={CHART_STROKE}>
          <circle cx={CHART_SIZE / 2} cy={CHART_SIZE / 2} r={CHART_RADIUS} className="stroke-surface-alt" />
          {arcs.map(({ seg, frac, start }) => (
            <circle
              key={seg.key}
              cx={CHART_SIZE / 2}
              cy={CHART_SIZE / 2}
              r={CHART_RADIUS}
              className={seg.strokeClassName}
              strokeDasharray={`${frac * CHART_C} ${CHART_C}`}
              strokeDashoffset={-start * CHART_C}
            />
          ))}
        </g>
        {arcs.map(({ seg, mid, showLabel }) =>
          showLabel ? (
            <text
              key={`${seg.key}-label`}
              x={CHART_SIZE / 2 + Math.cos(mid) * CHART_RADIUS}
              y={CHART_SIZE / 2 + Math.sin(mid) * CHART_RADIUS}
              textAnchor="middle"
              dominantBaseline="central"
              className="num fill-background text-[11px] font-semibold"
            >
              {seg.value}
            </text>
          ) : null,
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function Gauge({ fraction, strokeClassName, children }: { fraction: number; strokeClassName: string; children: ReactNode }) {
  const f = Math.max(0, Math.min(fraction, 1));
  return (
    <div className="relative mx-auto" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
      <svg width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} aria-hidden>
        <g transform={`rotate(-90 ${CHART_SIZE / 2} ${CHART_SIZE / 2})`} fill="none" strokeWidth={CHART_STROKE}>
          <circle cx={CHART_SIZE / 2} cy={CHART_SIZE / 2} r={CHART_RADIUS} className="stroke-surface-alt" />
          <circle
            cx={CHART_SIZE / 2}
            cy={CHART_SIZE / 2}
            r={CHART_RADIUS}
            className={strokeClassName}
            strokeLinecap="round"
            strokeDasharray={`${f * CHART_C} ${CHART_C}`}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function LegendRow({
  dotClassName,
  count,
  label,
  hint,
  badge,
  onClick,
  tintClassName,
}: {
  dotClassName: string;
  count: ReactNode;
  label: string;
  hint?: string;
  badge?: ReactNode;
  onClick?: (() => void) | undefined;
  tintClassName?: string;
}) {
  const body = (
    <>
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${dotClassName}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px]">
            <span className="num font-semibold">{count}</span> {label}
          </span>
          {badge}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
  const base = "flex w-full min-h-[38px] items-start gap-2.5 rounded-lg px-2 py-1.5 text-left";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tintClassName ?? ""}`}
    >
      {body}
    </button>
  );
}

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
  const BAND_STROKE: Record<string, string> = {
    critical: "stroke-destructive",
    below: "stroke-attention",
    meets: "stroke-primary",
    exceptional: "stroke-exceptional",
  };
  const BAND_SOFT: Record<string, string> = {
    critical: "bg-destructive/5",
    below: "bg-attention/5",
    meets: "bg-primary/5",
    exceptional: "bg-exceptional/5",
  };
  return (
    <div className={`panel p-6 ${average === null ? "" : BAND_SOFT[band]}`}>
      <p className="field-label">Average achievement</p>

      <div className="mt-4">
        <Gauge
          fraction={(average ?? 0) / ACHIEVEMENT_MAX}
          strokeClassName={BAND_STROKE[band] ?? "stroke-primary"}
        >
          <span className={`num text-[34px] font-semibold leading-none ${average === null ? "" : BAND_TEXT[band]}`}>
            {average === null ? "—" : `${average.toFixed(1)}%`}
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            {average === null ? "No scored KPIs yet" : BAND_LABEL[band]}
          </span>
        </Gauge>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
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
  strokeClassName: string;
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
  return (
    <div className="panel p-6">
      <p className="field-label">Pending evaluations</p>

      <div className="mt-4">
        <Donut
          segments={segments.map((s) => ({
            key: s.key,
            value: s.count,
            strokeClassName: s.strokeClassName,
            label: s.label,
          }))}
        >
          <span className="num text-[34px] font-semibold leading-none">{total}</span>
          <span className="mt-1 max-w-[110px] text-[11px] leading-snug text-muted-foreground">
            across your department this period
          </span>
        </Donut>
      </div>

      <ul className="mt-4 space-y-2">
        {!segments.length && (
          <li className="text-xs text-muted-foreground">Every KPI in this department is locked.</li>
        )}
        {segments.map((s) => (
          <li key={s.key}>
            <LegendRow
              dotClassName={s.dotClassName}
              count={s.count}
              label={s.label}
              hint={s.hint}
              tintClassName={s.tintClassName}
              onClick={onFilterStatus ? () => onFilterStatus(s.key) : undefined}
              badge={
                s.needsAction ? (
                  <span className="rounded-full border border-attention/30 bg-attention/10 px-2 py-0.5 text-[10px] font-medium text-attention">
                    Needs your action
                  </span>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

const KPI_TYPE_META: Record<string, { Icon: typeof TrendingUp; label: string }> = {
  higher_is_better: { Icon: TrendingUp, label: "Higher is better" },
  lower_is_better: { Icon: TrendingDown, label: "Lower is better" },
  milestone: { Icon: Flag, label: "Milestone" },
  qualitative: { Icon: Star, label: "Qualitative" },
};

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

  const severity = [
    { key: "critical", label: "Critical", hint: "Below 50%", dot: "bg-severity-critical", stroke: "stroke-severity-critical",
      count: rows.filter((r) => r.pct < 50).length },
    { key: "moderate", label: "Moderate", hint: "50–74%", dot: "bg-severity-moderate", stroke: "stroke-severity-moderate",
      count: rows.filter((r) => r.pct >= 50 && r.pct < 75).length },
    { key: "mild", label: "Mild", hint: "75–94%", dot: "bg-severity-mild", stroke: "stroke-severity-mild",
      count: rows.filter((r) => r.pct >= 75).length },
  ];

  return (
    <div className="panel p-6">
      <p className="field-label">KPIs below target</p>
      {!rows.length && <p className="mt-3 text-sm text-muted-foreground">Every scored KPI is at or above 95%.</p>}
      {rows.length > 0 && (
        <>
          <div className="mt-4">
            <Donut
              segments={severity.map((b) => ({ key: b.key, value: b.count, strokeClassName: b.stroke, label: b.label }))}
            >
              <span className="num text-[34px] font-semibold leading-none">{rows.length}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">below target</span>
            </Donut>
          </div>
          <ul className="mt-4 space-y-2">
            {severity.map((b) => (
              <li key={b.key}>
                <LegendRow
                  dotClassName={b.dot}
                  count={b.count}
                  label={`${b.label} — ${b.count === 1 ? "1 KPI" : `${b.count} KPIs`}`.replace(/^(.*?) — .*$/, "$1")}
                  hint={`${b.hint} · ${b.count === 1 ? "1 KPI" : `${b.count} KPIs`}`}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {rows.length > 0 && <p className="mt-4 text-[11px] text-muted-foreground">Sorted by severity</p>}
      <TooltipProvider delayDuration={150}>
        <ul className="mt-3 space-y-1">
          {shown.map(({ kpi, pct }) => {
            const band = bandOf(pct);
            const consecutive = streak(kpi);
            const type = KPI_TYPE_META[kpi.kpi_type] ?? KPI_TYPE_META["higher_is_better"]!;
            const TypeIcon = type.Icon;
            return (
              <li key={kpi.id}>
                <Link
                  to="/kpi/$id"
                  params={{ id: kpi.id }}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={type.label} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{kpi.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{kpi.employees?.name}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="flex w-9 justify-end">
                      {consecutive >= 2 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              onClick={(e) => e.preventDefault()}
                              className={`rounded-full border px-2 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${BAND_TINT.below}`}
                            >
                              <span className="num">{consecutive}×</span>
                              <span className="sr-only">
                                Below target for {consecutive} consecutive periods
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Below target for {consecutive} consecutive periods</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    <span
                      className="hidden h-1.5 w-[60px] overflow-hidden rounded-full bg-surface-alt sm:block"
                      aria-hidden="true"
                    >
                      <span
                        className={`block h-full rounded-full ${BAND_BG[band]}`}
                        style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
                      />
                    </span>
                    <span className={`num text-right text-[13px] ${BAND_TEXT[band]}`}>{fmtPct(pct)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </TooltipProvider>
      {rows.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {expanded ? "Show fewer" : `View all (${rows.length})`}
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      )}
    </div>
  );
}

