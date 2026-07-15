/**
 * Vitality system — unified damage/benefit/condition for any organism.
 *
 * The vitality concept treats an organism's `condition` (0–100 %) as a
 * homeostatic balance: each tick a sum of damage rates from stressors is
 * weighed against a sum of benefit rates from favourable factors. The
 * balance drives `condition` up or down, and any positive overflow once
 * `condition` is full accrues into a `surplus` bank — energy the
 * organism can spend on growth, breeding, longevity bonuses, etc.
 *
 * The surplus bank doubles as a **protective reserve buffer** above
 * condition. When damage outweighs benefit, it drains the bank before
 * condition falls: a well-stocked organism shrugs off a bad tick by
 * burning reserves, and only starts losing condition once the reserve
 * is spent. Accrual saturates at a cap (`surplusCap`) — a body banks
 * only so much reserve, like vitamin absorption; overflow beyond the
 * cap is discarded, not queued. A consequence worth internalising:
 * **condition 100 with negative net means burning reserves, not
 * thriving** — a buffered organism under attack reads 100 while its
 * bank drains (`net < 0` with `breakdown.drained > 0`).
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
  /**
   * Current banked surplus — the reserve buffer sitting above condition.
   * Damage drains it before condition falls; positive overflow accrues
   * back into it (capped). Clamped into `[0, surplusCap]` on entry, so an
   * over-cap value from an old save self-heals on the first tick.
   */
  surplus: number;
  /** Saturation cap for the bank. Accrual beyond it is discarded. */
  surplusCap: number;
  /**
   * Whether positive overflow accrues into the bank this tick. Defaults
   * to `true`. Plants pass `light > 0` — no photosynthesis means no new
   * photosynthate to store — but draining and the cap clamp still apply.
   */
  accrueSurplus?: boolean;
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
  /**
   * Reserve drained from the bank to absorb damage this tick (%/h,
   * ≥ 0). Non-zero only when `net < 0` and the bank had something to
   * spend. Condition-100 with `drained > 0` is the "burning reserves"
   * signal — the organism reads full but is spending down its buffer.
   */
  drained: number;
}

/** Result of a vitality tick. */
export interface VitalityResult {
  /** Updated condition (0–100). */
  newCondition: number;
  /**
   * Banked surplus after this tick — post-drain, post-accrual, clamped
   * into `[0, surplusCap]`. The caller stores this value directly (it is
   * the new bank, not a per-tick emission). The vitality module does not
   * interpret it; the caller decides how to spend it (biomass, breeding).
   */
  surplus: number;
  /** Per-factor and aggregate breakdown for UI / telemetry. */
  breakdown: VitalityBreakdown;
}

/** Outcome of folding one tick's net rate into a saturating bank. */
export interface SurplusBankTick {
  /** Bank after this tick, within `[0, cap]`. */
  surplus: number;
  /** Reserve drained to absorb damage (≥ 0). */
  drained: number;
  /**
   * Damage that outran the bank and reaches the stock (≥ 0). Zero unless
   * `net < 0` and the bank emptied before covering the whole hit.
   */
  overflowDamage: number;
}

/** Clamp a bank value into `[0, cap]` — the self-heal for over-cap old
 *  saves, shared by `bankSurplus`'s entry clamp and `computeVitality`'s
 *  idle-tick path. */
function clampBank(bank: number, cap: number): number {
  return Math.min(cap, Math.max(0, bank));
}

/**
 * Fold one tick's net vitality rate into a saturating reserve bank.
 *
 * The bank is a protective buffer above the organism's stock (fish /
 * plant condition, algae mass). Damage (`net < 0`) drains the bank
 * first; only `overflowDamage` — what the bank couldn't cover — reaches
 * the stock. Benefit (`net > 0`) accrues into the bank up to `cap` when
 * `accrue` is set, discarding the rest ("vitamin absorption").
 *
 * `bank` is clamped into `[0, cap]` on entry, so an over-cap value from
 * an old save self-heals on the first tick. Shared by `computeVitality`
 * (fish / plants) and the algae orchestrator so every organism type
 * buffers damage identically.
 */
export function bankSurplus(
  bank: number,
  net: number,
  cap: number,
  accrue: boolean
): SurplusBankTick {
  const start = clampBank(bank, cap);
  if (net < 0) {
    const drained = Math.min(start, -net);
    return { surplus: start - drained, drained, overflowDamage: -net - drained };
  }
  if (net > 0 && accrue) {
    return { surplus: Math.min(cap, start + net), drained: 0, overflowDamage: 0 };
  }
  // net === 0, or positive net with accrual gated off (overflow discarded).
  return { surplus: start, drained: 0, overflowDamage: 0 };
}

/**
 * Compute one tick of vitality for an organism.
 *
 * Algorithm:
 * 1. damageRate = Σ stressor.amount × (1 - hardiness)
 * 2. benefitRate = Σ benefit.amount  (no hardiness scaling)
 * 3. net = benefitRate − damageRate
 * 4. Condition + bank update:
 *    - net < 0: the bank absorbs the damage first (drain = min(bank,
 *      |net|)); condition falls only by the shortfall the bank can't
 *      cover. Condition stays put while the bank holds the line.
 *    - net > 0 and condition < 100: heal (clamped at 100). Any overshoot
 *      past 100 is spent on the final fraction, not banked; the bank is
 *      untouched but still clamped to the cap.
 *    - net > 0 and condition = 100: overflow accrues into the bank up to
 *      `surplusCap` (when `accrueSurplus`), discarding the rest.
 *    - net == 0: condition and bank unchanged (bank still clamped).
 *
 * Step 4's branching enforces the "recover then grow" trajectory: a
 * stressed organism cannot make progress while its condition is below
 * 100 %. The healing burns the entire benefit budget until the deficit
 * is paid down. The reserve buffer sits one layer above: it protects
 * condition from damage and only fills once condition is full.
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
  const cap = input.surplusCap;
  const accrue = input.accrueSurplus ?? true;

  let newCondition: number;
  let surplus: number;
  let drained: number;

  if (net < 0) {
    // Damage exceeds benefit — the reserve buffer soaks it up before
    // condition takes the hit. Only the shortfall the bank couldn't
    // cover bleeds condition (clamped at 0; downstream death checks
    // compare against configured thresholds).
    const bank = bankSurplus(input.surplus, net, cap, accrue);
    drained = bank.drained;
    surplus = bank.surplus;
    newCondition = Math.max(0, condition - bank.overflowDamage);
  } else if (net > 0 && condition >= 100) {
    // Healthy organism with extra capacity — condition stays full,
    // overflow accrues into the bank (capped) for the caller to spend.
    const bank = bankSurplus(input.surplus, net, cap, accrue);
    drained = 0;
    surplus = bank.surplus;
    newCondition = 100;
  } else {
    // net > 0 and condition < 100 → heal first, overshoot discarded.
    // (Or net === 0 → no change.) The bank is idle but still clamps to
    // the cap so an oversized old-save value self-heals.
    drained = 0;
    surplus = clampBank(input.surplus, cap);
    newCondition = Math.min(100, condition + net);
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
      drained,
    },
  };
}

/**
 * In-range benefit: `peak` while `value` is inside the `[lo, hi]`
 * tolerance band, zero outside. The matching stressor takes over once
 * the value crosses out of range, so the transition stays continuous in
 * the net-rate sense (lose `peak` of benefit, start gaining damage).
 *
 * Step-shaped on purpose: tolerance bands are mostly flat with cliff
 * edges (in/out of range), and a flat plateau keeps the benefit budget
 * near its ceiling when only one factor drops to the edge. Used by both
 * fish and plant vitality builders.
 *
 * `hi = Infinity` is a valid degenerate case — a one-sided "above
 * threshold" benefit (e.g. oxygen ≥ 5 mg/L).
 */
export function inRangeBenefit(value: number, lo: number, hi: number, peak: number): number {
  return value >= lo && value <= hi ? peak : 0;
}
