export type KpiType = "higher_is_better" | "lower_is_better" | "milestone" | "qualitative";

export type ScoringPolicy = {
  achievement_floor: number;
  achievement_cap: number;
  adjustment_escalation_threshold: number;
};

export type Milestone = {
  label: string;
  weight: number;
  completed?: boolean;
  evidence_id?: string | null;
  due_date?: string | null;
};

export const RUBRIC_SCORE_MAP: Record<number, number> = { 1: 20, 2: 45, 3: 70, 4: 95, 5: 120 };

export type ScoreResult = {
  achievement_percent: number | null;
  system_score: number;
  trace: Record<string, unknown>;
};

function applyCurve(achievement: number, policy: ScoringPolicy) {
  const floor = Number(policy.achievement_floor);
  const cap = Number(policy.achievement_cap);
  if (achievement < floor) return { score: 0, band: `below floor (<${floor}%)` };
  if (achievement <= 100) {
    return {
      score: ((achievement - floor) / (100 - floor)) * 100,
      band: `linear ${floor}%–100% achievement mapped to score 0–100`,
    };
  }
  if (achievement <= cap) {
    return {
      score: 100 + ((achievement - 100) / (cap - 100)) * (cap - 100),
      band: `linear 100%–${cap}% achievement mapped to score 100–${cap}`,
    };
  }
  return { score: cap, band: `capped at ${cap}` };
}

export function calculateScore(args: {
  kpiType: KpiType;
  target: number | null;
  actual: number | null;
  milestones?: Milestone[] | null;
  rubricLevel?: number | null;
  policy: ScoringPolicy;
}): ScoreResult {
  const { kpiType, target, actual, milestones, rubricLevel, policy } = args;

  if (kpiType === "qualitative") {
    const level = rubricLevel ?? 0;
    const score = RUBRIC_SCORE_MAP[level] ?? 0;
    return {
      achievement_percent: null,
      system_score: score,
      trace: {
        formula: "rubric_level_to_score_map[level]",
        rubric_level: level,
        map: RUBRIC_SCORE_MAP,
        system_score: score,
      },
    };
  }

  let achievement = 0;
  let formula = "";

  if (kpiType === "higher_is_better") {
    if (!target) throw new Error("Target value is required for this KPI type");
    achievement = ((actual ?? 0) / target) * 100;
    formula = `(actual ${actual} / target ${target}) * 100`;
  } else if (kpiType === "lower_is_better") {
    if (!target) throw new Error("Target value is required for this KPI type");
    achievement = Math.max((2 - (actual ?? 0) / target) * 100, 0);
    formula = `max((2 - (actual ${actual} / target ${target})) * 100, 0)`;
  } else {
    const list = milestones ?? [];
    achievement = list.filter((m) => m.completed).reduce((sum, m) => sum + Number(m.weight ?? 0), 0);
    formula = `sum(weight of completed milestones) = ${achievement}`;
  }

  achievement = Math.round(achievement * 100) / 100;
  const curved = applyCurve(achievement, policy);
  const system_score = Math.round(Math.min(curved.score, Number(policy.achievement_cap)) * 100) / 100;

  return {
    achievement_percent: achievement,
    system_score,
    trace: {
      formula,
      achievement_percent: achievement,
      curve: curved.band,
      policy,
      system_score,
    },
  };
}

export function weightedRollUp(rows: { final_score: number | null; weight_percent: number }[]) {
  const scored = rows.filter((r) => r.final_score !== null);
  const totalWeight = scored.reduce((s, r) => s + Number(r.weight_percent), 0);
  if (!totalWeight) return null;
  const sum = scored.reduce((s, r) => s + Number(r.final_score) * Number(r.weight_percent), 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}
