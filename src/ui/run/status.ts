/**
 * The health vocabulary shared across the instrument surface — sparklines,
 * condition bars, status words and alert outlines all speak it.
 */

import type { VitalityResult } from '../../simulation/index.js';

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
function conditionReading(condition: number): Reading {
  return { status: conditionStatus(condition), word: conditionWord(condition) };
}

/** Every vitality rate on the surface reads per day. */
export const PER_DAY = 24;

const TREND_DECIMALS = 1;

/** A change per hour as the trend prints it per day — zero where it reads steady. */
function shownPerDay(changePerHour: number): number {
  return Number((changePerHour * PER_DAY).toFixed(TREND_DECIMALS));
}

export function trendOf(changePerHour: number): string {
  const perDay = shownPerDay(changePerHour);
  if (perDay === 0) return 'steady';
  return `${perDay > 0 ? '↗' : '↘'} ${Math.abs(perDay).toFixed(TREND_DECIMALS)}/d`;
}

const SICK: Reading = { status: 'warn', word: 'sick' };

export interface VitalReading {
  sick: boolean;
  reading: Reading;
  value: string;
  trend: string;
}

/**
 * How an organism reads over the hour its vitality was taken on. It is sick
 * while its condition falls — damage outrunning healing — at the precision the
 * trend prints, so the word, the trend and the figure cannot disagree: a
 * falling condition is floored rather than rounded back up to where it was.
 * Sickness wins a tie with the condition's own word.
 */
export function vitalReading(condition: number, vitality: VitalityResult): VitalReading {
  const change = vitality.newCondition - condition;
  const sick = shownPerDay(change) < 0;
  const health = conditionReading(condition);
  return {
    sick,
    reading: sick ? worstReading(SICK, health) : health,
    value: (sick ? Math.floor(condition) : Math.round(condition)).toString(),
    trend: trendOf(change),
  };
}

/** One member of a species group: its condition, and how it reads. */
export interface Member extends Reading {
  condition: number;
}

/**
 * A group reads as its most urgent members, counted — every one at that tone,
 * so the count is the dots it sits over: `2 sick`, or `3 unwell` where their
 * reasons differ. A group with nobody to flag reads its worst member's
 * condition, and a group of one reads as its member.
 */
export function groupReading(members: readonly Member[]): Reading {
  if (members.length === 1) return { status: members[0].status, word: members[0].word };
  const severity = Math.max(...members.map((member) => STATUS_SEVERITY[member.status]));
  if (severity === 0) return conditionReading(Math.min(...members.map((member) => member.condition)));
  const flagged = members.filter((member) => STATUS_SEVERITY[member.status] === severity);
  const reason = new Set(flagged.map((member) => member.word)).size === 1 ? flagged[0].word : 'unwell';
  return { status: flagged[0].status, word: `${flagged.length} ${reason}` };
}
