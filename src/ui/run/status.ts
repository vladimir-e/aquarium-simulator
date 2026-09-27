/**
 * The health vocabulary shared across the instrument surface — sparklines,
 * condition bars, status words and alert outlines all speak it.
 */

import { TICKS_PER_DAY } from '../utils/clock.js';

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

/** Of two statuses, the one that needs the reader first. */
export function worstStatus(a: Status, b: Status): Status {
  return STATUS_SEVERITY[b] > STATUS_SEVERITY[a] ? b : a;
}

/** Of two readings of the same organism, the one that needs the reader first. */
export function worstReading(a: Reading, b: Reading): Reading {
  return STATUS_SEVERITY[b.status] > STATUS_SEVERITY[a.status] ? b : a;
}

/** How an organism is doing, off its condition. */
function conditionReading(condition: number): Reading {
  return { status: conditionStatus(condition), word: conditionWord(condition) };
}

/** Whether a figure prints as nothing at this many decimals — the one test every surface rounds by. */
export function printsAsZero(value: number, decimals: number): boolean {
  return Math.abs(value) < 0.5 / 10 ** decimals;
}

/** A change over a day as a reading row prints it: nothing while it prints as zero. */
export function dayTrend(perDay: number, decimals: number): string {
  if (printsAsZero(perDay, decimals)) return '';
  return `${perDay > 0 ? '↗' : '↘'} ${Math.abs(perDay).toFixed(decimals)}/d`;
}

const TREND_DECIMALS = 1;

/** What the next tick does to a figure, per day, as a reading row prints it: nothing while it holds. */
export function projectedDrift(changePerHour: number): string {
  return dayTrend(changePerHour * TICKS_PER_DAY, TREND_DECIMALS);
}

/** What the next tick does to a figure, from the change it makes in its hour. */
export function projectedTrend(changePerHour: number): string {
  return projectedDrift(changePerHour) || 'steady';
}

const SICK: Reading = { status: 'warn', word: 'sick' };

export interface VitalReading {
  sick: boolean;
  reading: Reading;
  value: string;
  trend: string;
}

/**
 * How an organism reads over the hour ahead, from its condition now to the
 * condition the tick leaves it at. It is sick while its condition falls —
 * damage outrunning healing — at the precision the trend prints, so the word
 * and the trend cannot disagree. The figure is
 * rounded down, so it never shows a band the condition has not reached. Sickness
 * wins a tie with the condition's own word.
 */
export function vitalReading(condition: number, next: number): VitalReading {
  const change = next - condition;
  const sick = change < 0 && projectedDrift(change) !== '';
  const health = conditionReading(condition);
  return {
    sick,
    reading: sick ? worstReading(SICK, health) : health,
    value: Math.floor(condition).toString(),
    trend: projectedTrend(change),
  };
}

/** One member of a species group: how it reads, and the condition behind it. */
export interface Member {
  condition: number;
  reading: Reading;
}

/** The member a group is read as: the most urgent, and of those the lowest condition. */
export function worstMember<M extends Member>(members: readonly M[]): M {
  return members.reduce((worst, member) => {
    const urgency = STATUS_SEVERITY[member.reading.status] - STATUS_SEVERITY[worst.reading.status];
    return urgency > 0 || (urgency === 0 && member.condition < worst.condition) ? member : worst;
  });
}

interface Tally<M extends Member> {
  worst: M;
  /** The members at the worst tone, where that tone flags anything. */
  flagged: M[];
  /** What the flagged share, or the worst member's word where nothing is flagged. */
  reason: string;
}

function tally<M extends Member>(members: readonly M[]): Tally<M> {
  const worst = worstMember(members);
  const severity = STATUS_SEVERITY[worst.reading.status];
  if (severity === 0) return { worst, flagged: [], reason: worst.reading.word };
  const flagged = members.filter((member) => STATUS_SEVERITY[member.reading.status] === severity);
  const reason =
    new Set(flagged.map((member) => member.reading.word)).size === 1 ? worst.reading.word : 'unwell';
  return { worst, flagged, reason };
}

/**
 * A group reads as its most urgent members, counted — every one at that tone,
 * so the count is the dots it sits over: `2 sick`, or `3 unwell` where their
 * reasons differ. A group with nobody to flag, or a group of one, reads as its
 * worst member.
 */
export function groupReading(members: readonly Member[]): Reading {
  const { worst, flagged, reason } = tally(members);
  if (members.length === 1 || flagged.length === 0) return worst.reading;
  return { status: worst.reading.status, word: `${flagged.length} ${reason}` };
}

/**
 * A group standing as one member of the group above it, so the rule nests: at
 * its worst member's tone and condition, under the word its flagged members
 * share. The count is left to the level doing the counting, which counts groups.
 */
export function groupMember(members: readonly Member[]): Member {
  const { worst, reason } = tally(members);
  return { condition: worst.condition, reading: { status: worst.reading.status, word: reason } };
}

/** A bank as a share of its cap — what the next brood or offshoot costs. Nothing fills a cap of 0. */
export function bankShare(bank: number, cap: number): number {
  return cap > 0 ? Math.min(1, bank / cap) : 0;
}
