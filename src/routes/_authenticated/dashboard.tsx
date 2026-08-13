import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
      { name: "description", content: "Department score distribution, adjustment rates and evidence coverage." },
      { property: "og:title", content: "Management dashboard — Anwar KPIFlow" },
      { property: "og:description", content: "Organisation-wide performance and scoring integrity signals." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  useRealtimeKpis();
  const { data: kpis } = useKpis();
  const { data: employees } = useEmployees();
  const { data: departments } = useDepartments();


  const deptScores = useMemo(() => {
    const empDept = new Map((employees ?? []).map((e) => [e.id, e.department_id]));
    const buckets = new Map<string, { weight_percent: number; final_score: number }[]>();
    for (const kpi of kpis ?? []) {
      const score = latestScore(kpi);
      if (score?.final_score === null || score?.final_score === undefined) continue;
      const dept = empDept.get(kpi.employee_id) ?? "unassigned";
      const list = buckets.get(dept) ?? [];
      list.push({ weight_percent: Number(kpi.weight_percent), final_score: Number(score.final_score) });
      buckets.set(dept, list);
    }
    return (departments ?? []).map((d) => ({
      name: d.name,
      score: weightedRollUp(buckets.get(d.id) ?? []) ?? 0,
      count: (buckets.get(d.id) ?? []).length,
    }));
  }, [kpis, employees, departments]);

  const distribution = useMemo(() => {
    const bands = [
      { name: "0–69", min: 0, max: 69, count: 0 },
      { name: "70–89", min: 70, max: 89, count: 0 },
      { name: "90–99", min: 90, max: 99, count: 0 },
      { name: "100–109", min: 100, max: 109, count: 0 },
      { name: "110–120", min: 110, max: 999, count: 0 },
    ];
    for (const kpi of kpis ?? []) {
      const s = latestScore(kpi)?.final_score;
      if (s === null || s === undefined) continue;
      const band = bands.find((b) => Number(s) >= b.min && Number(s) <= b.max);
      if (band) band.count += 1;
    }
    return bands;
  }, [kpis]);

  const integrity = useMemo(() => {
    const scored = (kpis ?? []).map((k) => latestScore(k)).filter(Boolean);
    const adjusted = scored.filter((s) => Number(s!.adjustment_delta) !== 0).length;
    const withEvidence = (kpis ?? []).filter((k) =>
      (k.actual_entries ?? []).some((e) => (e.evidence ?? []).length > 0),
    ).length;
    const submitted = (kpis ?? []).filter((k) => (k.actual_entries ?? []).length > 0).length;
    return {
      adjustmentRate: scored.length ? Math.round((adjusted / scored.length) * 100) : 0,
      evidenceCoverage: submitted ? Math.round((withEvidence / submitted) * 100) : 0,
      approved: scored.filter((s) => s!.final_score !== null).length,
      total: (kpis ?? []).length,
    };
  }, [kpis]);

  const management = useMemo(() => {
    const rows = kpis ?? [];
    const evaluatedEmployees = new Set<string>();
    const pendingEmployees = new Set<string>();
    let approvalsPending = 0;
    let adjusted = 0;
    const finals: number[] = [];
    const achievements: number[] = [];

    for (const kpi of rows) {
      const score = latestScore(kpi);
      if (score?.final_score !== null && score?.final_score !== undefined) {
        evaluatedEmployees.add(kpi.employee_id);
        finals.push(Number(score.final_score));
        if (Number(score.adjustment_delta) !== 0) adjusted += 1;
      } else {
        pendingEmployees.add(kpi.employee_id);
      }
      if (score?.achievement_percent !== null && score?.achievement_percent !== undefined) {
        achievements.push(Number(score.achievement_percent));
      }
      if (["pending_target_approval", "submitted", "correction_requested"].includes(kpi.status)) {
        approvalsPending += 1;
      }
    }
    const avg = (list: number[]) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : 0);
    return {
      evaluated: evaluatedEmployees.size,
      awaitingEmployees: [...pendingEmployees].filter((id) => !evaluatedEmployees.has(id)).length,
      pendingKpis: rows.length - finals.length,
      approvalsPending,
      adjusted,
      avgScore: avg(finals),
      avgAchievement: avg(achievements),
    };
  }, [kpis]);

  const ranked = useMemo(() => {
    const withData = deptScores.filter((d) => d.count > 0).sort((a, b) => b.score - a.score);
    return { top: withData[0] ?? null, bottom: withData.length > 1 ? withData[withData.length - 1] : null };
  }, [deptScores]);

  const recurringGaps = useMemo(() => {
    const byKpi = new Map<string, { name: string; employee: string; misses: number; periods: number }>();
    for (const kpi of kpis ?? []) {
      const score = latestScore(kpi);
      const achievement = score?.achievement_percent;
      if (achievement === null || achievement === undefined) continue;
      const key = `${kpi.name}::${kpi.employee_id}`;
      const entry =
        byKpi.get(key) ?? { name: kpi.name, employee: kpi.employees?.name ?? "—", misses: 0, periods: 0 };
      entry.periods += 1;
      if (Number(achievement) < 100) entry.misses += 1;
      byKpi.set(key, entry);
    }
    return [...byKpi.values()]
      .filter((e) => e.misses >= 2 || (e.periods === 1 && e.misses === 1))
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 6);
  }, [kpis]);

  const trend = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>();
    for (const kpi of kpis ?? []) {
      const score = latestScore(kpi);
      if (score?.final_score === null || score?.final_score === undefined) continue;
      const d = new Date(kpi.period_start);
      const label = `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
      const bucket = buckets.get(label) ?? { total: 0, count: 0 };
      bucket.total += Number(score.final_score);
      bucket.count += 1;
      buckets.set(label, bucket);
    }
    return [...buckets.entries()]
      .map(([label, b]) => ({ label, score: Math.round((b.total / b.count) * 10) / 10 }))
      .sort((a, b) => a.label.slice(3).localeCompare(b.label.slice(3)) || a.label.localeCompare(b.label));
  }, [kpis]);

  const deptDetail = useMemo(() => {
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
    for (const d of departments ?? []) {
      map.set(d.id, { id: d.id, name: d.name, achievements: [], pending: 0, belowTarget: 0, byEmployee: new Map() });
    }
    for (const kpi of kpis ?? []) {
      const deptId = empDept.get(kpi.employee_id) ?? kpi.department_id;
      const agg = deptId ? map.get(deptId) : undefined;
      if (!agg) continue;
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
    }
    return [...map.values()].map((agg) => {
      const people = [...agg.byEmployee.entries()]
        .map(([id, rows]) => ({ name: empName.get(id) ?? "—", score: weightedRollUp(rows) ?? 0 }))
        .sort((a, b) => b.score - a.score);
      return {
        id: agg.id,
        name: agg.name,
        avgAchievement: agg.achievements.length
          ? Math.round((agg.achievements.reduce((a, b) => a + b, 0) / agg.achievements.length) * 10) / 10
          : null,
        pending: agg.pending,
        belowTarget: agg.belowTarget,
        high: people[0] ?? null,
        low: people.length > 1 ? people[people.length - 1] : null,
      };
    });
  }, [kpis, employees, departments]);



  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Management dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Every figure is a live aggregation of approved score records — nothing here is estimated.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Employees evaluated"
          value={String(management.evaluated)}
          hint={`${management.awaitingEmployees} awaiting evaluation · ${management.pendingKpis} KPIs pending`}
        />

        <Stat label="Average KPI score" value={String(management.avgScore)} hint="Approved final scores" />
        <Stat label="Average achievement" value={`${management.avgAchievement}%`} hint="Actual vs target" />
        <Stat label="Approvals pending" value={String(management.approvalsPending)} hint="Targets & submissions" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Top department" value={ranked.top?.name ?? "—"} hint={ranked.top ? `${ranked.top.score} weighted score` : "No approved scores yet"} />
        <Stat label="Needs attention" value={ranked.bottom?.name ?? "—"} hint={ranked.bottom ? `${ranked.bottom.score} weighted score` : "No approved scores yet"} />
        <Stat label="Scores manually adjusted" value={String(management.adjusted)} hint={`${integrity.adjustmentRate}% of scored KPIs`} />
        <Stat label="Evidence coverage" value={`${integrity.evidenceCoverage}%`} hint={`${integrity.total} KPIs tracked`} />
      </div>

      <div className="panel overflow-x-auto">
        <div className="px-5 pt-5">
          <h3 className="text-sm font-semibold">Department view</h3>
          <p className="text-xs text-muted-foreground">
            Average achievement, high and low performers, pending evaluations and KPIs below target.
          </p>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-medium">Department</th>
              <th className="px-5 py-2 text-right font-medium">Avg achievement</th>
              <th className="px-5 py-2 font-medium">High performer</th>
              <th className="px-5 py-2 font-medium">Low performer</th>
              <th className="px-5 py-2 text-right font-medium">Pending evaluations</th>
              <th className="px-5 py-2 text-right font-medium">KPIs below target</th>
            </tr>
          </thead>
          <tbody>
            {deptDetail.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-5 py-2">{d.name}</td>
                <td className="num px-5 py-2 text-right">{d.avgAchievement === null ? "—" : `${d.avgAchievement}%`}</td>
                <td className="px-5 py-2">
                  {d.high ? `${d.high.name} · ${d.high.score.toFixed(1)}` : "—"}
                </td>
                <td className="px-5 py-2">{d.low ? `${d.low.name} · ${d.low.score.toFixed(1)}` : "—"}</td>
                <td className="num px-5 py-2 text-right">{d.pending}</td>
                <td className="num px-5 py-2 text-right">{d.belowTarget}</td>
              </tr>
            ))}
            {!deptDetail.length && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-muted-foreground">
                  No departments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Weighted score by department</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptScores}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis domain={[0, 120]} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" name="Weighted score" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Score distribution</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip />
                <Bar dataKey="count" name="KPIs" radius={[4, 4, 0, 0]}>
                  {distribution.map((band, i) => (
                    <Cell
                      key={band.name}
                      fill={
                        i === 0
                          ? "var(--color-destructive)"
                          : i === 1
                            ? "var(--color-attention)"
                            : "var(--color-primary)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Performance trend over time</h3>
          <p className="text-xs text-muted-foreground">Average approved score per period</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis domain={[0, 120]} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Average score"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-semibold">KPIs consistently below target</h3>
          <p className="text-xs text-muted-foreground">Recurring gaps worth a conversation</p>
          <ul className="mt-4 space-y-3">
            {recurringGaps.length === 0 && (
              <li className="text-sm text-muted-foreground">No KPIs are falling short of target right now.</li>
            )}
            {recurringGaps.map((gap) => (
              <li key={`${gap.name}-${gap.employee}`} className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{gap.name}</p>
                  <p className="text-xs text-muted-foreground">{gap.employee}</p>
                </div>
                <span className="num text-xs text-muted-foreground">
                  {gap.misses} of {gap.periods} period{gap.periods === 1 ? "" : "s"} below target
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
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
