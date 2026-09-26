/**
 * The health vocabulary shared across the instrument surface — sparklines,
 * condition bars, status words and alert outlines all speak it.
 */

/** The four-way status every coloured element on the surface is tinted by. */
export type Status = 'ok' | 'warn' | 'alert' | 'neutral';

/** Condition on the 0–100 vitality axis every organism in the tank is scored on. */
export function conditionStatus(condition: number): Status {
  return condition < 30 ? 'alert' : condition < 60 ? 'warn' : 'ok';
}

export function conditionWord(condition: number): string {
  if (condition < 10) return 'dying';
  if (condition < 30) return 'struggling';
  if (condition < 60) return 'fair';
  if (condition < 80) return 'good';
  return 'thriving';
}

/** Ranking for the vocabulary, so "worst first" is one definition. */
export const STATUS_SEVERITY: Record<Status, number> = { neutral: 0, ok: 0, warn: 1, alert: 2 };

/** One row's headline: how it is doing, and the word for it. */
export interface Reading {
  status: Status;
  word: string;
}

/** Of two readings of the same organism, the one that needs the reader first. */
export function worstReading(a: Reading, b: Reading): Reading {
  return STATUS_SEVERITY[b.status] > STATUS_SEVERITY[a.status] ? b : a;
}

/** How an organism is doing, off its condition. */
export function conditionReading(condition: number): Reading {
  return { status: conditionStatus(condition), word: conditionWord(condition) };
}
