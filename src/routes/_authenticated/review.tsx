import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Review console</h1>
        <p className="text-sm text-muted-foreground">
          Adjustments are bounded, require a reason code and justification, and are written to the audit log.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !queue.length && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Nothing is waiting on you right now.</div>
      )}

      {!!queue.length && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="panel divide-y divide-border overflow-hidden">
            {queue.map((kpi) => (
              <button
                key={kpi.id}
                onClick={() => setSelectedId(kpi.id)}
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-surface-alt ${
                  selected?.id === kpi.id ? "bg-surface-alt" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{kpi.name}</span>
                  <StatusBadge status={kpi.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kpi.employees?.name} · weight <span className="num">{kpi.weight_percent}%</span>
                </p>
              </button>
            ))}
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
                    () => approveTargetFn({ data: { kpi_definition_id: kpi.id, decision: "approve" } }),
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
                        data: { kpi_definition_id: kpi.id, decision: "return", reason: returnReason },
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
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{kpi.name}</h3>
            <p className="text-xs text-muted-foreground">{kpi.employees?.name}</p>
          </div>
          <Link to="/kpi/$id" params={{ id: kpi.id }} className="text-xs underline">
            Open full record
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Target</dt>
            <dd className="num">{kpi.target_value ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Actual</dt>
            <dd className="num">{actual?.actual_value ?? actual?.rubric_level ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Evidence</dt>
            <dd className="num">{(actual?.evidence ?? []).length} file(s)</dd>
          </div>
        </dl>
        {actual?.comments && <p className="mt-3 text-sm text-muted-foreground">“{actual.comments}”</p>}
      </div>

      <CalculationPanel kpi={kpi} score={score} />

      <div className="panel space-y-4 p-5">
        <h3 className="text-sm font-semibold">Decision</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="delta">Adjustment (points)</Label>
            <Input id="delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
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
          <Label htmlFor="just">Justification</Label>
          <Textarea id="just" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () => decide({ data: { kpi_definition_id: kpi.id, decision: "approve" } }),
                "Score approved and locked",
              )
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve as calculated
          </Button>
          <Button
            variant="secondary"
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
            variant="outline"
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
