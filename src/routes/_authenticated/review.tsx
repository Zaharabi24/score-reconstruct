import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { latestActual, latestScore, useKpis, useRealtimeKpis, type KpiRow } from "@/lib/queries";
import { approveTarget, reviewDecision } from "@/lib/kpi.functions";
import { StatusBadge } from "@/components/StatusBadge";
import { CalculationPanel } from "@/components/CalculationPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REASON_CODES = [
  "market_conditions",
  "scope_change",
  "data_quality",
  "external_dependency",
  "exceptional_effort",
];

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Review console — Anwar KPIFlow" },
      { name: "description", content: "Approve targets, review submitted actuals and apply governed score adjustments." },
      { property: "og:title", content: "Review console — Anwar KPIFlow" },
      { property: "og:description", content: "Manager queue for targets, actuals and bounded adjustments." },
    ],
  }),
  component: ReviewConsole,
});

function ReviewConsole() {
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: all, isLoading } = useKpis();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      (all ?? []).filter(
        (k) =>
          (k.reviewer_id === me?.id || k.approver_id === me?.id) &&
          ["pending_target_approval", "submitted", "correction_requested"].includes(k.status),
      ),
    [all, me?.id],
  );
  const selected = queue.find((k) => k.id === selectedId) ?? queue[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold leading-tight">Review console</h1>
        <p className="text-sm text-muted-foreground">
          Adjustments are bounded, require a reason code and justification, and are written to the audit log.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !queue.length && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Nothing is waiting on you right now.</div>
      )}

      {!!queue.length && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="flex flex-col gap-3 self-start">
            <h2 className="field-label">Pending queue ({queue.length})</h2>
            {queue.map((kpi) => {
              const isSelected = selected?.id === kpi.id;
              return (
                <div
                  key={kpi.id}
                  className={`panel card-hover border-l-4 p-5 ${
                    isSelected ? "border-l-primary bg-surface-alt" : "border-l-transparent"
                  }`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{kpi.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {kpi.employees?.name} · weight <span className="num">{kpi.weight_percent}%</span>
                      </p>
                    </div>
                    <StatusBadge status={kpi.status} />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      className="rounded-lg font-semibold shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md"
                      onClick={() => setSelectedId(kpi.id)}
                      aria-pressed={isSelected}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {selected && <ReviewPanel key={selected.id} kpi={selected} />}
        </div>
      )}
    </div>
  );
}


function ReviewPanel({ kpi }: { kpi: KpiRow }) {
  const queryClient = useQueryClient();
  const decide = useServerFn(reviewDecision);
  const approveTargetFn = useServerFn(approveTarget);
  const score = latestScore(kpi);
  const actual = latestActual(kpi);
  const [delta, setDelta] = useState("0");
  const [reasonCode, setReasonCode] = useState<string>(REASON_CODES[0]!);
  const [justification, setJustification] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (kpi.status === "pending_target_approval") {
    return (
      <div className="space-y-4">
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Target approval</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Approve the target before the period opens. Targets are locked once approved.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd className="num text-lg">
                {kpi.target_value ?? "—"} {kpi.unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Period</dt>
              <dd className="num">
                {kpi.period_start} → {kpi.period_end}
              </dd>
            </div>
          </dl>
          <div className="mt-4 space-y-3">
            <Textarea
              rows={2}
              placeholder="Reason (required when returning)"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => approveTargetFn({ data: { kpi_definition_id: kpi.id, approve: true } }),
                    "Target approved — the KPI is now active",
                  )
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve target
              </Button>
              <Button
                variant="outline"
                disabled={busy || returnReason.length < 5}
                onClick={() =>
                  run(
                    () =>
                      approveTargetFn({
                        data: { kpi_definition_id: kpi.id, approve: false, rejection_reason: returnReason },
                      }),
                    "Returned to HR for revision",
                  )
                }
              >
                Return for revision
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{kpi.name}</h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{kpi.employees?.name}</p>
          </div>
          <Link
            to="/kpi/$id"
            params={{ id: kpi.id }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Open full record <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="stat-block">
            <p className="field-label">Target</p>
            <p className="num mt-1 text-[15px] font-medium">{kpi.target_value ?? "—"}</p>
          </div>
          <div className="stat-block">
            <p className="field-label">Actual</p>
            <p className="num mt-1 text-[15px] font-medium">{actual?.actual_value ?? actual?.rubric_level ?? "—"}</p>
          </div>
          <div className="stat-block">
            <p className="field-label">Evidence</p>
            <p className="num mt-1 text-[15px] font-medium">{(actual?.evidence ?? []).length} file(s)</p>
          </div>
        </div>
        {actual?.comments && <p className="quote-callout mt-5 text-sm">“{actual.comments}”</p>}
      </div>

      <CalculationPanel kpi={kpi} score={score} />

      <div className="panel space-y-5 p-6">
        <h3 className="text-base font-bold">Decision</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="delta" className="field-label">
              Adjustment (points)
            </Label>
            <Input id="delta" type="number" className="num h-10" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="field-label">Reason code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="just" className="field-label">
            Justification
          </Label>
          <Textarea id="just" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 rounded-lg font-semibold"
            disabled={busy}
            onClick={() =>
              run(
                () => decide({ data: { kpi_definition_id: kpi.id, decision: "approve" } }),
                "Score approved and locked",
              )
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve calculated
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-lg border-primary text-primary hover:bg-primary/10 hover:text-primary"
            disabled={busy || Number(delta) === 0 || justification.trim().length < 10}
            onClick={() =>
              run(
                () =>
                  decide({
                    data: {
                      kpi_definition_id: kpi.id,
                      decision: "adjust",
                      adjustment_delta: Number(delta),
                      adjustment_reason_code: reasonCode,
                      adjustment_justification: justification,
                    },
                  }),
                "Adjustment applied and logged",
              )
            }
          >
            Apply adjustment
          </Button>
          <Button
            variant="ghost"
            className="h-10 rounded-lg text-muted-foreground"
            disabled={busy || justification.trim().length < 5}
            onClick={() =>
              run(
                () =>
                  decide({
                    data: { kpi_definition_id: kpi.id, decision: "return", return_reason: justification },
                  }),
                "Returned to the employee",
              )
            }
          >
            Return to employee
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adjustments outside the policy band are rejected server-side; every decision is written to the audit log.
        </p>
      </div>
    </div>
  );
}

