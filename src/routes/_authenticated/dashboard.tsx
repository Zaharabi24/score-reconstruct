import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { latestScore, useDepartments, useEmployees, useKpis, useRealtimeKpis } from "@/lib/queries";
import { weightedRollUp } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Management dashboard — Anwar KPIFlow" },
      { name: "description", content: "How people, teams and scores are tracking this quarter, in plain language." },
      { property: "og:title", content: "Management dashboard — Anwar KPIFlow" },
      { property: "og:description", content: "Organisation-wide performance and scoring integrity signals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const TEAL = "var(--color-primary)";
const AMBER = "var(--color-attention)";
const BRICK = "var(--color-destructive)";
const NEUTRAL = "var(--color-muted-foreground)";

function avg(list: number[]) {
  return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : 0;
}

function quarterLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

function Dashboard() {
  useRealtimeKpis();
  const { data: kpis } = useKpis();
  const { data: employees } = useEmployees();
  const { data: departments } = useDepartments();
  const [showTable, setShowTable] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [byDepartment, setByDepartment] = useState(false);

  /** The most recent period present in the data — everything "now" is scoped to it. */
  const currentPeriod = useMemo(() => {
    const periods = (kpis ?? []).map((k) => k.period_start).sort();
    return periods[periods.length - 1] ?? null;
  }, [kpis]);

  const currentKpis = useMemo(
    () => (kpis ?? []).filter((k) => k.period_start === currentPeriod),
    [kpis, currentPeriod],
  );

  /* ── Zone A ─────────────────────────────────────────────────── */
  const glance = useMemo(() => {
    const evaluated = new Set<string>();
    const pendingPeople = new Set<string>();
    let approvalsPending = 0;
    let adjusted = 0;
    let scored = 0;
    const finals: number[] = [];
    const achievements: number[] = [];

    for (const kpi of currentKpis) {
      const score = latestScore(kpi);
      const final = score?.final_score;
      if (final !== null && final !== undefined) {
        evaluated.add(kpi.employee_id);
        finals.push(Number(final));
      } else {
        pendingPeople.add(kpi.employee_id);
      }
      if (score) {
        scored += 1;
        if (Number(score.adjustment_delta) !== 0) adjusted += 1;
      }
      if (score?.achievement_percent !== null && score?.achievement_percent !== undefined) {
        achievements.push(Number(score.achievement_percent));
      }
      if (["pending_target_approval", "submitted", "correction_requested"].includes(kpi.status)) {
        approvalsPending += 1;
      }
    }

    const people = new Set(currentKpis.map((k) => k.employee_id));
    const withEvidence = currentKpis.filter((k) =>
      (k.actual_entries ?? []).some((e) => (e.evidence ?? []).length > 0),
    ).length;
    const submitted = currentKpis.filter((k) => (k.actual_entries ?? []).length > 0).length;

    return {
      evaluated: evaluated.size,
      people: people.size,
      stillPending: [...pendingPeople].filter((id) => !evaluated.has(id)).length,
      avgScore: avg(finals),
      avgAchievement: avg(achievements),
      approvalsPending,
      adjusted,
      belowTarget: achievements.filter((a) => a < 100).length,
      totalKpis: currentKpis.length,
      adjustedRate: scored ? Math.round((adjusted / scored) * 100) : 0,
      evidence: submitted ? Math.round((withEvidence / submitted) * 100) : 0,
    };
  }, [currentKpis]);

  /* ── Zone B ─────────────────────────────────────────────────── */
  const deptRows = useMemo(() => {
    const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
    const empDept = new Map((employees ?? []).map((e) => [e.id, e.department_id]));
    const empName = new Map((employees ?? []).map((e) => [e.id, e.name]));

    type Agg = {
      id: string;
      name: string;
      achievements: number[];
      pending: number;
      belowTarget: number;
      byEmployee: Map<string, { weight_percent: number; final_score: number }[]>;
    };
    const map = new Map<string, Agg>();

    for (const kpi of currentKpis) {
      const deptId = empDept.get(kpi.employee_id) ?? kpi.department_id;
      if (!deptId || !deptName.has(deptId)) continue;
      const agg =
        map.get(deptId) ??
        ({
          id: deptId,
          name: deptName.get(deptId) ?? "—",
          achievements: [],
          pending: 0,
          belowTarget: 0,
          byEmployee: new Map(),
        } as Agg);
      const score = latestScore(kpi);
      const achievement = score?.achievement_percent;
      if (achievement !== null && achievement !== undefined) {
        agg.achievements.push(Number(achievement));
        if (Number(achievement) < 100) agg.belowTarget += 1;
      }
      if (score?.final_score === null || score?.final_score === undefined) {
        agg.pending += 1;
      } else {
        const list = agg.byEmployee.get(kpi.employee_id) ?? [];
        list.push({ weight_percent: Number(kpi.weight_percent), final_score: Number(score.final_score) });
        agg.byEmployee.set(kpi.employee_id, list);
      }
      map.set(deptId, agg);
    }

    return [...map.values()]
      .map((agg) => {
        const people = [...agg.byEmployee.entries()]
          .map(([id, rows]) => ({ name: empName.get(id) ?? "—", score: weightedRollUp(rows) ?? 0 }))
          .sort((a, b) => b.score - a.score);
        return {
          id: agg.id,
          name: agg.name,
          achievement: agg.achievements.length ? avg(agg.achievements) : null,
          pending: agg.pending,
          belowTarget: agg.belowTarget,
          high: people[0] ?? null,
          low: people.length > 1 ? people[people.length - 1] : null,
        };
      })
      .filter((d) => d.achievement !== null)
      .sort((a, b) => (b.achievement ?? 0) - (a.achievement ?? 0));
  }, [currentKpis, departments, employees]);

  const best = deptRows[0] ?? null;
  const watch = deptRows.length > 1 ? deptRows[deptRows.length - 1] : null;

  /* ── Zone C ─────────────────────────────────────────────────── */
  const gaps = useMemo(() => {
    const byKpi = new Map<string, { name: string; employee: string; misses: number; periods: number }>();
    for (const kpi of kpis ?? []) {
      const achievement = latestScore(kpi)?.achievement_percent;
      if (achievement === null || achievement === undefined) continue;
      const key = `${kpi.name}::${kpi.employee_id}`;
      const entry = byKpi.get(key) ?? { name: kpi.name, employee: kpi.employees?.name ?? "—", misses: 0, periods: 0 };
      entry.periods += 1;
      if (Number(achievement) < 90) entry.misses += 1;
      byKpi.set(key, entry);
    }
    return [...byKpi.values()].filter((e) => e.misses >= 1).sort((a, b) => b.misses - a.misses);
  }, [kpis]);

  /** Per-person KPI score achievement for the current period (weighted, from real score records). */
  const peopleProgress = useMemo(() => {
    const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
    const empById = new Map((employees ?? []).map((e) => [e.id, e]));
    const map = new Map<
      string,
      { id: string; name: string; department: string; totalPoints: number; achievedPoints: number; kpiCount: number; pending: number }
    >();

    for (const kpi of currentKpis) {
      const emp = empById.get(kpi.employee_id);
      const row =
        map.get(kpi.employee_id) ?? {
          id: kpi.employee_id,
          name: emp?.name ?? kpi.employees?.name ?? "—",
          department: (emp?.department_id ? deptName.get(emp.department_id) : null) ?? "Unassigned",
          totalPoints: 0,
          achievedPoints: 0,
          kpiCount: 0,
          pending: 0,
        };
      row.kpiCount += 1;
      const final = latestScore(kpi)?.final_score;
      const weight = Number(kpi.weight_percent) || 0;
      if (final === null || final === undefined) {
        row.pending += 1;
      } else {
        row.totalPoints += weight;
        row.achievedPoints += (Number(final) / 100) * weight;
      }
      map.set(kpi.employee_id, row);
    }

    return [...map.values()]
      .filter((r) => r.totalPoints > 0)
      .map((r) => ({
        ...r,
        totalPoints: Math.round(r.totalPoints * 10) / 10,
        achievedPoints: Math.round(r.achievedPoints * 10) / 10,
        percent: Math.round((r.achievedPoints / r.totalPoints) * 1000) / 10,
      }))
      .sort((a, b) => b.percent - a.percent);
  }, [currentKpis, departments, employees]);


  /* ── Zone D ─────────────────────────────────────────────────── */
  const distribution = useMemo(() => {
    const bands = [
      { name: "0–69", plain: "Below target", min: 0, max: 69, count: 0 },
      { name: "70–89", plain: "Near target", min: 70, max: 89, count: 0 },
      { name: "90–99", plain: "On target", min: 90, max: 99, count: 0 },
      { name: "100–109", plain: "Above target", min: 100, max: 109, count: 0 },
      { name: "110–120", plain: "Well above", min: 110, max: 999, count: 0 },
    ];
    for (const kpi of currentKpis) {
      const s = latestScore(kpi)?.final_score;
      if (s === null || s === undefined) continue;
      const band = bands.find((b) => Number(s) >= b.min && Number(s) <= b.max);
      if (band) band.count += 1;
    }
    return bands;
  }, [currentKpis]);

  const avgBandIndex = useMemo(() => {
    const s = glance.avgScore;
    const edges = [69, 89, 99, 109];
    const idx = edges.findIndex((e) => s <= e);
    return idx === -1 ? 4 : idx;
  }, [glance.avgScore]);

  const trend = useMemo(() => {
    const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
    const empDept = new Map((employees ?? []).map((e) => [e.id, e.department_id]));
    const buckets = new Map<string, { start: string; total: number; count: number; depts: Map<string, number[]> }>();
    for (const kpi of kpis ?? []) {
      const score = latestScore(kpi);
      if (score?.final_score === null || score?.final_score === undefined) continue;
      const label = quarterLabel(kpi.period_start);
      const bucket = buckets.get(label) ?? { start: kpi.period_start, total: 0, count: 0, depts: new Map() };
      bucket.total += Number(score.final_score);
      bucket.count += 1;
      const dept = deptName.get(empDept.get(kpi.employee_id) ?? kpi.department_id ?? "") ?? null;
      if (dept) {
        const list = bucket.depts.get(dept) ?? [];
        list.push(Number(score.final_score));
        bucket.depts.set(dept, list);
      }
      buckets.set(label, bucket);
    }
    const rows = [...buckets.entries()]
      .sort((a, b) => a[1].start.localeCompare(b[1].start))
      .map(([label, b]) => {
        const row: Record<string, string | number> = {
          label,
          score: Math.round((b.total / b.count) * 10) / 10,
        };
        for (const [dept, scores] of b.depts) row[dept] = avg(scores);
        return row;
      });
    const deptKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "label" && k !== "score");
    return { rows, deptKeys };
  }, [kpis, departments, employees]);

  const adjusters = useMemo(() => {
    const empName = new Map((employees ?? []).map((e) => [e.id, e.name]));
    const counts = new Map<string, number>();
    for (const kpi of currentKpis) {
      const score = latestScore(kpi);
      if (!score || Number(score.adjustment_delta) === 0) continue;
      const who = score.reviewed_by ?? score.approved_by;
      if (!who) continue;
      counts.set(who, (counts.get(who) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ name: empName.get(id) ?? "Unknown reviewer", count }))
      .sort((a, b) => b.count - a.count);
  }, [currentKpis, employees]);

  const deptPalette = [TEAL, AMBER, BRICK, NEUTRAL, "var(--color-ink-soft, #52666A)"];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl">Management dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Everything here is read live from approved records — nothing is estimated or hard-coded.
        </p>
      </div>

      {/* ZONE A */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg">At a glance</h2>
          <p className="text-sm text-muted-foreground">
            The six numbers that tell you how this quarter is going.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Evaluated / pending" value={`${glance.evaluated} / ${glance.people}`} />
          <Stat label="Average score" value={`${glance.avgScore} / 120`} hint="From approved scores only" />
          <Stat label="Avg. target achievement" value={`${glance.avgAchievement}%`} />
          <Stat label="Approvals pending" value={String(glance.approvalsPending)} />
          <Stat
            label="Best department"
            value={best ? `${best.name} (${best.achievement})` : "—"}
            textValue
          />
          <Stat
            label="Weakest department"
            value={watch ? `${watch.name} (${watch.achievement})` : "—"}
            textValue
          />
          <Stat label="KPIs below target" value={String(glance.belowTarget)} />
          <Stat label="Manually adjusted" value={String(glance.adjusted)} />
        </div>

      </section>

      {/* ZONE B */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg">Business unit performance</h2>
          <p className="text-sm text-muted-foreground">
            How close each team came to its targets this quarter — only teams with active work appear.
          </p>
        </div>
        <div className="panel p-5">
          {deptRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team has approved results for this period yet.</p>
          ) : (
            <>
              <div style={{ height: Math.max(180, deptRows.length * 56) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptRows} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 8 }}>
                    <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                    <XAxis
                      type="number"
                      domain={[0, 120]}
                      fontSize={12}
                      stroke="var(--color-muted-foreground)"
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      fontSize={12}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Average achievement"]} />
                    <Bar dataKey="achievement" name="Average achievement" radius={[0, 4, 4, 0]} barSize={22}>
                      {deptRows.map((d, i) => (
                        <Cell
                          key={d.id}
                          fill={i === 0 ? TEAL : i === deptRows.length - 1 && deptRows.length > 1 ? AMBER : NEUTRAL}
                        />
                      ))}
                      <LabelList
                        dataKey="achievement"
                        position="right"
                        formatter={(v: number) => `${v}%`}
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {best && (
                  <span className="rounded-full bg-surface-alt px-3 py-1 text-xs">
                    <span style={{ color: TEAL }}>●</span> Best: {best.name} — {best.achievement}%
                  </span>
                )}
                {watch && (
                  <span className="rounded-full bg-surface-alt px-3 py-1 text-xs">
                    <span style={{ color: AMBER }}>●</span> Watch: {watch.name} — {watch.achievement}%
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="mt-4 text-xs font-medium text-primary underline underline-offset-4"
              >
                {showTable ? "Hide full department breakdown" : "View full department breakdown"}
              </button>

              {showTable && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Department</th>
                        <th className="px-4 py-2 text-right font-medium">Avg achievement</th>
                        <th className="px-4 py-2 font-medium">High performer</th>
                        <th className="px-4 py-2 font-medium">Low performer</th>
                        <th className="px-4 py-2 text-right font-medium">Pending evaluations</th>
                        <th className="px-4 py-2 text-right font-medium">KPIs below target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptRows.map((d) => (
                        <tr key={d.id} className="border-t border-border">
                          <td className="px-4 py-2">{d.name}</td>
                          <td className="num px-4 py-2 text-right">{d.achievement}%</td>
                          <td className="px-4 py-2">{d.high ? `${d.high.name} · ${d.high.score.toFixed(1)}` : "—"}</td>
                          <td className="px-4 py-2">{d.low ? `${d.low.name} · ${d.low.score.toFixed(1)}` : "—"}</td>
                          <td className="num px-4 py-2 text-right">{d.pending}</td>
                          <td className="num px-4 py-2 text-right">{d.belowTarget}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ZONE C */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg">Recurring gaps</h2>
          <p className="text-sm text-muted-foreground">
            KPIs that have missed target for two or more periods running — worth a conversation.
          </p>
        </div>
        <div className="panel p-5">
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is falling short of target right now.</p>
          ) : (
            <ul className="space-y-3">
              {(showAllGaps ? gaps : gaps.slice(0, 5)).map((gap) => (
                <li
                  key={`${gap.name}-${gap.employee}`}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span
                    aria-hidden
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: gap.misses >= 3 ? BRICK : gap.misses === 2 ? AMBER : NEUTRAL }}
                  />
                  <div>
                    <p className="text-sm font-medium">{gap.name}</p>
                    <p className="text-xs text-muted-foreground">{gap.employee}</p>
                    <p className="mt-1 text-xs">
                      {gap.misses >= 3
                        ? `Missed target ${gap.misses} periods in a row`
                        : gap.misses === 2
                          ? "Missed target 2 periods in a row"
                          : "Missed target every period so far"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {gaps.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllGaps((v) => !v)}
              className="mt-4 text-xs font-medium text-primary underline underline-offset-4"
            >
              {showAllGaps ? "Show fewer" : `View all (${gaps.length})`}
            </button>
          )}
        </div>
      </section>

      {/* ZONE D */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg">Score integrity &amp; trend</h2>
          <p className="text-sm text-muted-foreground">
            Whether scoring looks balanced, whether it is improving, and who is changing scores by hand.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="panel p-5">
            <h3 className="text-sm font-semibold">How scores are spread out</h3>
            <p className="text-xs text-muted-foreground">
              Most people&apos;s scores should cluster in the middle — a lot of very low or very high scores is worth a
              second look.
            </p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    fontSize={12}
                    stroke="var(--color-muted-foreground)"
                    interval={0}
                    tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
                      const band = distribution.find((b) => b.name === payload.value);
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text textAnchor="middle" y={12} fontSize={12} fill="var(--color-muted-foreground)">
                            {payload.value}
                          </text>
                          <text textAnchor="middle" y={28} fontSize={10} fill="var(--color-muted-foreground)">
                            {band?.plain}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <YAxis allowDecimals={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip />
                  <ReferenceLine
                    x={distribution[avgBandIndex]?.name ?? distribution[0]!.name}
                    stroke={NEUTRAL}
                    strokeDasharray="4 4"
                    label={{ value: `Average ${glance.avgScore}`, fontSize: 10, position: "top" }}
                  />
                  <Bar dataKey="count" name="KPIs" radius={[4, 4, 0, 0]}>
                    {distribution.map((band, i) => (
                      <Cell key={band.name} fill={i === 0 ? BRICK : i === 1 ? AMBER : TEAL} />
                    ))}
                    <LabelList dataKey="count" position="top" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Are scores improving over time</h3>
                <p className="text-xs text-muted-foreground">Average approved score each quarter.</p>
              </div>
              <button
                type="button"
                onClick={() => setByDepartment((v) => !v)}
                className="text-xs font-medium text-primary underline underline-offset-4"
              >
                {byDepartment ? "Show organisation total" : "Break down by department"}
              </button>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend.rows} margin={{ top: 20, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={12} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 120]} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip />
                  {byDepartment ? (
                    trend.deptKeys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={deptPalette[i % deptPalette.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))
                  ) : (
                    <Line type="monotone" dataKey="score" name="Average score" stroke={TEAL} strokeWidth={2} dot={{ r: 4 }}>
                      <LabelList dataKey="score" position="top" fontSize={11} />
                    </Line>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {byDepartment && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {trend.deptKeys.map((key, i) => (
                  <span key={key} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: deptPalette[i % deptPalette.length] }}
                    />
                    {key}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Who&apos;s adjusting scores, and how often</h3>
          <p className="text-xs text-muted-foreground">
            Helps spot if one reviewer is adjusting far more than others — a normal calibration check, not an
            accusation.
          </p>
          {adjusters.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No scores were adjusted by hand this quarter.</p>
          ) : (
            <div className="mt-4" style={{ height: Math.max(140, adjusters.length * 48) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adjusters} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" allowDecimals={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <YAxis type="category" dataKey="name" width={150} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip formatter={(v: number) => [v, "Adjustments"]} />
                  <Bar dataKey="count" name="Adjustments" fill={NEUTRAL} radius={[0, 4, 4, 0]} barSize={18}>
                    <LabelList dataKey="count" position="right" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  textValue,
}: {
  label: string;
  value: string;
  hint?: string;
  textValue?: boolean;
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={textValue ? "mt-2 font-display text-lg font-semibold" : "num mt-2 text-3xl"}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
