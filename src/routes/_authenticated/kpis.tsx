import { createFileRoute, Link } from "@tanstack/react-router";
import { differenceInCalendarDays } from "date-fns";
import { useMe } from "@/hooks/useMe";
import { latestActual, latestScore, useKpis, useRealtimeKpis } from "@/lib/queries";
import { EmployeeTabs } from "@/components/EmployeeTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkflowStepper } from "@/components/WorkflowStepper";

export const Route = createFileRoute("/_authenticated/kpis")({
  head: () => ({
    meta: [
      { title: "My KPIs — Anwar KPIFlow" },
      { name: "description", content: "Your assigned variable KPIs, targets, actuals and live workflow status." },
      { property: "og:title", content: "My KPIs — Anwar KPIFlow" },
      { property: "og:description", content: "Track targets, actuals and approval status for your KPIs." },
    ],
  }),
  component: MyKpis,
});

function MyKpis() {
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: kpis, isLoading } = useKpis(me ? { employeeId: me.id } : undefined);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl">My KPIs</h1>
          <p className="text-sm text-muted-foreground">
            Every score below is computed by the scoring engine and traceable back to its evidence.
          </p>
        </div>
        <EmployeeTabs />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !kpis?.length && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          No KPIs assigned to you yet. An HR admin creates KPI definitions in the KPI Setup Wizard.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(kpis ?? []).map((kpi) => {
          const score = latestScore(kpi);
          const actual = latestActual(kpi);
          const daysLeft = differenceInCalendarDays(new Date(kpi.period_end), new Date());
          return (
            <Link
              key={kpi.id}
              to="/kpi/$id"
              params={{ id: kpi.id }}
              className="panel block p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{kpi.name}</h2>
                <StatusBadge status={kpi.status} />
              </div>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {kpi.perspective} · weight <span className="num">{kpi.weight_percent}%</span>
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Target</dt>
                  <dd className="num">{kpi.target_value ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Actual</dt>
                  <dd className="num">{actual?.actual_value ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Score</dt>
                  <dd className="num">{score?.final_score ?? score?.calculated_score ?? "—"}</dd>
                </div>
              </dl>

              <div className="mt-4">
                <WorkflowStepper status={kpi.status} />
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                {daysLeft >= 0 ? `${daysLeft} days remaining in period` : `Period closed ${-daysLeft} days ago`}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
