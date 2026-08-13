import type { KpiRow, ScoreRow } from "@/lib/queries";

export function CalculationPanel({ kpi, score }: { kpi: KpiRow; score: ScoreRow | null }) {
  if (!score) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        No score has been calculated yet. A score appears as soon as an actual value is submitted.
      </div>
    );
  }
  const trace = (score.calculation_trace ?? {}) as Record<string, unknown>;
  return (
    <div className="panel p-6">
      <h3 className="text-base font-bold">Calculation path</h3>
      <dl className="mt-4 text-sm">
        <Row label="Formula" value={String(trace["formula"] ?? "—")} mono />
        <Row label="Achievement" value={score.achievement_percent === null ? "n/a" : `${score.achievement_percent}%`} mono />
        <Row label="Curve applied" value={String(trace["curve"] ?? "rubric map")} />
        <Row label="Calculated score" value={String(score.calculated_score ?? "—")} mono />
        <Row
          label="Adjustment"
          value={`${Number(score.adjustment_delta) > 0 ? "+" : ""}${score.adjustment_delta}${
            score.adjustment_reason_code ? ` · ${score.adjustment_reason_code}` : ""
          }`}
          mono
        />
        {score.adjustment_justification && <Row label="Justification" value={score.adjustment_justification} />}
        <Row
          label="Final score"
          value={score.final_score === null ? "pending approval" : String(score.final_score)}
          mono={score.final_score !== null}
          pending={score.final_score === null}
        />
        <Row label="Score version" value={`v${score.version_number}`} mono />
        <Row label="Weight in roll-up" value={`${kpi.weight_percent}%`} mono />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  pending,
}: {
  label: string;
  value: string;
  mono?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="field-label">{label}</dt>
      <dd className={`text-right text-[14px] ${mono ? "num" : ""}`}>
        {pending ? (
          <span className="inline-flex items-center rounded-full border border-attention/30 bg-attention/10 px-2.5 py-0.5 text-xs font-medium text-attention">
            Pending approval
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
