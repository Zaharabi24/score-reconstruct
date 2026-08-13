import type { KpiRow, ScoreRow } from "@/lib/queries";

export function CalculationPanel({ kpi, score }: { kpi: KpiRow; score: ScoreRow | null }) {
  if (!score) {
    return (
      <div className="panel p-5 text-sm text-muted-foreground">
        No score has been calculated yet. A score appears as soon as an actual value is submitted.
      </div>
    );
  }
  const trace = (score.calculation_trace ?? {}) as Record<string, unknown>;
  return (
    <div className="panel p-5">
      <h3 className="text-sm font-semibold">Calculation path</h3>
      <dl className="mt-3 space-y-2 text-sm">
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
        <Row label="Final score" value={score.final_score === null ? "pending approval" : String(score.final_score)} mono />
        <Row label="Score version" value={`v${score.version_number}`} mono />
        <Row label="Weight in roll-up" value={`${kpi.weight_percent}%`} mono />
      </dl>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "num" : ""}`}>{value}</dd>
    </div>
  );
}
