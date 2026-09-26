/**
 * Vitality — the one model every organism with a condition runs on.
 *
 * `condition` (0–100) is the buffer between dying and thriving, normal at 100.
 * Each tick benefit rates raise it and damage rates lower it, so nothing dies
 * or heals instantly. Income past 100 banks as `surplus`, capped at
 * `surplusCap`; below 100 the bank heals condition at the organism's healing
 * share, the same first-order law growth draws on. Damage never reaches the
 * bank: the only way out of it is the heal, and whatever the caller spends on
 * growth or offspring.
 *
 * Pure / framework-free — no Immer, no state mutation.
 */

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
  /** Current bank, clamped into `[0, surplusCap]` on entry. */
  surplus: number;
  /** Ceiling on the bank; a negative cap reads as 0. */
  surplusCap: number;
  /** Share of the bank per hour that heals condition below 100, within [0, 1]. */
  healingRate: number;
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
  /** Condition the bank restored this tick. */
  healed: number;
  /** Income that went into the bank this tick. */
  banked: number;
}

/** Result of a vitality tick. */
export interface VitalityResult {
  /** Updated condition (0–100). */
  newCondition: number;
  /** The bank after this tick, within `[0, surplusCap]`. */
  surplus: number;
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

/**
 * One tick of vitality:
 * 1. clamp the bank into `[0, cap]`;
 * 2. `condition += Σ benefits − Σ stressors`;
 * 3. above 100 the excess banks (overflow past the cap is discarded) and
 *    condition sits at 100;
 * 4. below 100 the bank heals `min(100 − condition, healingRate × bank)`;
 * 5. condition is floored at 0.
 */
export function computeVitality(input: VitalityInput): VitalityResult {
  const sum = (factors: VitalityFactor[]): number =>
    factors.reduce((total, factor) => total + factor.amount, 0);

  const damageRate = sum(input.stressors);
  const benefitRate = sum(input.benefits);
  const net = benefitRate - damageRate;

  const cap = Math.max(0, input.surplusCap);
  let surplus = Math.min(cap, Math.max(0, input.surplus));
  let condition = Math.max(0, Math.min(100, input.condition)) + net;
  let banked = 0;
  let healed = 0;

  if (condition > 100) {
    banked = Math.min(cap - surplus, condition - 100);
    surplus += banked;
    condition = 100;
  } else if (condition < 100) {
    const share = Math.max(0, Math.min(1, input.healingRate));
    healed = Math.min(100 - condition, share * surplus);
    surplus -= healed;
    condition += healed;
  }

  return {
    newCondition: Math.max(0, condition),
    surplus,
    breakdown: {
      stressors: input.stressors,
      benefits: input.benefits,
      damageRate,
      benefitRate,
      net,
      healed,
      banked,
    },
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
