/**
 * Vitality — the one model every organism with a condition runs on.
 *
 * `condition` (0–100) is the buffer between dying and thriving, normal at 100.
 * Each tick benefit rates raise it and damage rates lower it, and the repair
 * its reserve paid for heals it, so nothing dies or heals instantly. Nothing
 * banks: condition past 100 is lost.
 *
 * Pure / framework-free — no Immer, no state mutation.
 */

import { sum } from '../core/sum.js';

/**
 * A single contribution to either damage or benefit, kept for UI display.
 *
 * Direction (damage vs. benefit) is carried by which array a factor lives
 * in — `VitalityInput.stressors` or `VitalityInput.benefits` — not by a
 * tag on the factor itself.
 */
export interface VitalityFactor {
  /** Stable identifier (used as React key, log channel, etc.). */
  key: string;
  /** Human-readable label. Plant cards / fish cards render this. */
  label: string;
  /** Magnitude in %/h. Always non-negative; direction comes from the array. */
  amount: number;
}

/** Inputs to a vitality computation. */
export interface VitalityInput {
  /**
   * Stressor factors (units: %/h), charged as given: the caller has
   * already folded in severity and hardiness (see {@link hardened}).
   */
  stressors: VitalityFactor[];
  /** Benefit factors (units: %/h). */
  benefits: VitalityFactor[];
  /** Current condition (0–100). */
  condition: number;
  /** Points its reserve repaired this hour. */
  healed: number;
}

/** Per-factor breakdown plus aggregated rates, for UI / debug. */
export interface VitalityBreakdown {
  stressors: VitalityFactor[];
  benefits: VitalityFactor[];
  /** Total damage rate (%/h). */
  damageRate: number;
  /** Total benefit rate (%/h). */
  benefitRate: number;
  /** benefitRate − damageRate (%/h). */
  net: number;
  /** Points its reserve repaired this tick. */
  healed: number;
}

/** Result of a vitality tick. */
export interface VitalityResult {
  /** Updated condition (0–100). */
  newCondition: number;
  breakdown: VitalityBreakdown;
}

/**
 * Scale damage factors by `1 − hardiness`, hardiness clamped to [0, 1].
 * The default way an organism's builder hardens what it charges; a channel
 * whose hardiness moves its tolerance instead is charged as built.
 */
export function hardened(factors: VitalityFactor[], hardiness: number): VitalityFactor[] {
  const factor = 1 - Math.max(0, Math.min(1, hardiness));
  return factors.map((f) => ({ ...f, amount: f.amount * factor }));
}

/** One tick of vitality: `condition + Σ benefits − Σ stressors + healed`, held within [0, 100]. */
export function computeVitality({ stressors, benefits, condition, healed }: VitalityInput): VitalityResult {
  const damageRate = sum(stressors.map((factor) => factor.amount));
  const benefitRate = sum(benefits.map((factor) => factor.amount));
  const net = benefitRate - damageRate;
  return {
    newCondition: Math.max(0, Math.min(100, condition + net + healed)),
    breakdown: { stressors, benefits, damageRate, benefitRate, net, healed },
  };
}

/**
 * Share of a tolerance band's benefit earned at `value`: 1 at the band's
 * centre, falling to 0 at either edge, where the matching stressor starts
 * from 0 — a symmetric parabola.
 */
export function bandComfort(value: number, [lo, hi]: readonly [number, number]): number {
  const width = hi - lo;
  return width > 0 ? Math.max(0, (4 * (value - lo) * (hi - value)) / (width * width)) : 0;
}

export function outsideBand(value: number, [lo, hi]: readonly [number, number]): number {
  return Math.max(0, lo - value, value - hi);
}

/** Share of `edge` that `value` falls short of: 0 at or over it, 1 at nothing. */
export function shortfall(value: number, edge: number): number {
  return edge > 0 ? Math.max(0, 1 - value / edge) : 0;
}

/**
 * How many e-folds `value` stands past `edge`, zero at or under it. Toxicity
 * runs on log dose, so doubling a concentration adds the same harm wherever it
 * starts.
 */
export function eFoldsPast(value: number, edge: number): number {
  return value > edge ? Math.log(value / edge) : 0;
}

/**
 * How many e-folds `value` stands under `edge`, zero at or over it, both read
 * `offset` higher so the log stays smooth and finite all the way to zero.
 */
export function eFoldsUnder(value: number, edge: number, offset: number): number {
  return eFoldsPast(edge + offset, Math.max(value, 0) + offset);
}
