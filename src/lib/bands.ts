import type { KpiRow, ScoreRow } from "@/lib/queries";
import { latestScore } from "@/lib/queries";

export type Band = "critical" | "below" | "meets" | "exceptional";

export const BAND_LABEL: Record<Band, string> = {
  critical: "Significantly below",
  below: "Below target",
  meets: "Meets / exceeds",
  exceptional: "Exceptional",
};

/** One colour language for the whole department section. */
export const BAND_TEXT: Record<Band, string> = {
  critical: "text-destructive",
  below: "text-attention",
  meets: "text-primary",
  exceptional: "text-exceptional",
};

export const BAND_BG: Record<Band, string> = {
  critical: "bg-destructive",
  below: "bg-attention",
  meets: "bg-primary",
  exceptional: "bg-exceptional",
};

export const BAND_TINT: Record<Band, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  below: "bg-attention/10 text-attention border-attention/30",
  meets: "bg-primary/10 text-primary border-primary/30",
  exceptional: "bg-exceptional/10 text-exceptional border-exceptional/30",
};

export function bandOf(pct: number): Band {
  if (pct < 75) return "critical";
  if (pct < 95) return "below";
  if (pct < 110) return "meets";
  return "exceptional";
}

export const ACHIEVEMENT_MAX = 120;

/** Percentage of the 0–120 scale a value occupies, clamped for display. */
export function barWidth(pct: number) {
  return `${Math.max(0, Math.min(pct, ACHIEVEMENT_MAX)) / ACHIEVEMENT_MAX * 100}%`;
}

/** Achievement for a KPI: the adjusted result when one exists, else the calculated one. */
export function achievementOf(kpi: KpiRow): number | null {
  const score: ScoreRow | null = latestScore(kpi);
  if (!score) return null;
  if (score.final_score !== null) return Number(score.final_score);
  if (score.achievement_percent !== null) return Number(score.achievement_percent);
  if (score.calculated_score !== null) return Number(score.calculated_score);
  return null;
}

export function fmtPct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
