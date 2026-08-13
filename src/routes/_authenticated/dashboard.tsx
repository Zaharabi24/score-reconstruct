import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
      { title: "Executive dashboard — Anwar KPIFlow" },
      { name: "description", content: "Department score distribution, adjustment rates and evidence coverage." },
      { property: "og:title", content: "Executive dashboard — Anwar KPIFlow" },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Executive dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Every figure is a live aggregation of approved score records — nothing here is estimated.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="KPIs tracked" value={String(integrity.total)} />
        <Stat label="Scores approved" value={String(integrity.approved)} />
        <Stat label="Adjustment rate" value={`${integrity.adjustmentRate}%`} />
        <Stat label="Evidence coverage" value={`${integrity.evidenceCoverage}%`} />
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
