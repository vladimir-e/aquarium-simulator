/**
 * Vitality system — unified damage/benefit/condition for any organism.
 *
 * The vitality concept treats an organism's `condition` (0–100 %) as a
 * homeostatic balance: each tick a sum of damage rates from stressors is
 * weighed against a sum of benefit rates from favourable factors. The
 * balance drives `condition` up or down, and any positive overflow once
 * `condition` is full becomes `surplus` — energy the organism can spend
 * on growth, breeding, longevity bonuses, etc.
 *
 * The module is **organism-agnostic about how surplus is spent.** Plants
 * route surplus to biomass production; fish capture it for future use.
 * Both share the same vitality math so behaviour stays consistent across
 * lifeforms (and so a stressed plant heals before it grows, just like a
 * stressed fish heals before it breeds).
 *
 * Pure / framework-free — no Immer, no state mutation. Returns a fresh
 * value the caller folds into its own state shape.
 */

/** A single contribution to either damage or benefit, kept for UI display. */
export interface VitalityFactor {
  /** Stable identifier (used as React key, log channel, etc.). */
  key: string;
  /** Human-readable label. Plant cards / fish cards render this. */
  label: string;
  /**
   * Magnitude in %/h. Positive for damage *or* benefit — direction is
   * carried by the `kind` field, not by the sign here.
   */
  amount: number;
  /** Whether this factor adds to damage or benefit. */
  kind: 'damage' | 'benefit';
}

/** Inputs to a vitality computation. */
export interface VitalityInput {
  /**
   * Stressor factors (units: %/h). Severities are pre-multiplied by the
   * caller (e.g., temperature gap × severity), but **not** by hardiness —
   * the module applies the hardiness factor centrally.
   */
  stressors: VitalityFactor[];
  /**
   * Benefit factors (units: %/h). Caller-provided severities exactly as
   * with stressors. Hardiness does not scale benefits — a hardy organism
   * is damaged less, not energised more.
   */
  benefits: VitalityFactor[];
  /**
   * Effective hardiness (0–1). The caller is responsible for clamping /
   * applying species + per-individual offsets before passing in. The
   * module multiplies stressor totals by `(1 - hardiness)`.
   */
  hardiness: number;
  /** Current condition (0–100). */
  condition: number;
}

/** Per-factor breakdown plus aggregated rates, for UI / debug. */
export interface VitalityBreakdown {
  /** Stressor factors with hardiness already applied to `amount`. */
  stressors: VitalityFactor[];
  /** Benefit factors (unchanged from input). */
  benefits: VitalityFactor[];
  /** Total damage rate (%/h), post-hardiness. */
  damageRate: number;
  /** Total benefit rate (%/h). */
  benefitRate: number;
  /** Net rate (benefit − damage). Positive = recovering. */
  net: number;
}

/** Result of a vitality tick. */
export interface VitalityResult {
  /** Updated condition (0–100). */
  newCondition: number;
  /**
   * Surplus produced this tick (%/h equivalent). Only non-zero when
   * net > 0 *and* condition was already 100 — the organism has health
   * to spare. The vitality module does not interpret this number; the
   * caller decides how to spend it (biomass, breeding, etc.).
   */
  surplus: number;
  /** Per-factor and aggregate breakdown for UI / telemetry. */
  breakdown: VitalityBreakdown;
}

/**
 * Compute one tick of vitality for an organism.
 *
 * Algorithm:
 * 1. damageRate = Σ stressor.amount × (1 - hardiness)
 * 2. benefitRate = Σ benefit.amount  (no hardiness scaling)
 * 3. net = benefitRate − damageRate
 * 4. Condition update:
 *    - net < 0:                    condition += net, clamped at 0; surplus = 0
 *    - net > 0 and condition < 100: condition += net, clamped at 100; surplus = 0
 *    - net > 0 and condition = 100: condition stays 100; surplus = net
 *    - net == 0:                    condition unchanged; surplus = 0
 *
 * Step 4's branching enforces the "recover then grow" trajectory: a
 * stressed organism cannot make progress while its condition is below
 * 100 %. The healing burns the entire benefit budget until the deficit
 * is paid down.
 */
export function computeVitality(input: VitalityInput): VitalityResult {
  // Clamp hardiness to [0, 1]; out-of-range values shouldn't poison the
  // arithmetic. Callers may legitimately produce ≥ 0.95 or ≤ 0.1 via
  // species + offset clamping; we just guarantee the multiplier stays
  // sane here.
  const clampedHardiness = Math.max(0, Math.min(1, input.hardiness));
  const hardinessFactor = 1 - clampedHardiness;

  // Apply hardiness to each stressor so the breakdown the UI shows
  // matches the actual damage being inflicted.
  const scaledStressors = input.stressors.map((s) => ({
    ...s,
    amount: s.amount * hardinessFactor,
  }));

  const damageRate = scaledStressors.reduce((sum, s) => sum + s.amount, 0);
  const benefitRate = input.benefits.reduce((sum, b) => sum + b.amount, 0);
  const net = benefitRate - damageRate;

  const condition = Math.max(0, Math.min(100, input.condition));

  let newCondition: number;
  let surplus: number;

  if (net < 0) {
    // Damage exceeds benefit — bleed condition. Clamp at 0 so callers
    // don't see negative values; downstream death checks compare against
    // configured thresholds.
    newCondition = Math.max(0, condition + net);
    surplus = 0;
  } else if (net > 0 && condition >= 100) {
    // Healthy organism with extra capacity — condition stays full,
    // overflow becomes surplus the caller can route to growth/breeding.
    newCondition = 100;
    surplus = net;
  } else {
    // net > 0 and condition < 100 → heal first, no surplus until full.
    // (Or net === 0 → no change.) Clamp at 100 so a final partial-tick
    // recovery doesn't stamp on the surplus path next tick.
    newCondition = Math.min(100, condition + net);
    surplus = 0;
  }

  return {
    newCondition,
    surplus,
    breakdown: {
      stressors: scaledStressors,
      benefits: input.benefits,
      damageRate,
      benefitRate,
      net,
    },
  };
}
