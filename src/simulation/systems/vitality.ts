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
 * Income splits into two ledgers, and which one a deficit belongs to
 * decides which stock it reaches. `upkeep` is the cost of simply being
 * alive: income pays it first, the bank pays what income couldn't, and
 * what neither could cover is reported as `starved` for the caller to
 * take out of its own tissue. Only `stressors` — damage done *to* the
 * organism rather than energy it failed to earn — spend condition. An
 * organism that declares no upkeep ledger runs the single-ledger
 * balance unchanged.
 *
 * The surplus bank is a **protective buffer**: damage drains it before
 * condition falls, so a well-stocked organism shrugs off a bad tick by
 * burning reserves. The two ledgers reach different depths of it, and
 * that ordering is what keeps a poisoned organism from starving itself.
 * Upkeep has first claim and may spend the bank to the last unit;
 * damage may only spend what stands above `upkeepReserveHours` of
 * upkeep, so a reserve that is down to survival rations pays for
 * staying alive and nothing else. Accrual saturates at a cap
 * (`surplusCap`) — a body banks only so much reserve, like vitamin
 * absorption; overflow beyond the cap is discarded, not queued. A
 * consequence worth internalising: **condition 100 with negative net
 * means burning reserves, not thriving** (`net < 0` with
 * `breakdown.drained > 0`).
 *
 * The module is **organism-agnostic about how surplus is spent.** Plants
 * route surplus to repair and then to biomass; fish capture it for
 * future use. Both share the same vitality math so behaviour stays
 * consistent across lifeforms — and either way a stressed organism
 * heals before it grows or breeds, whether the healing comes out of its
 * income or out of its bank.
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
   * Stressor factors (units: %/h), charged as given: the caller has
   * already folded in severity and hardiness (see {@link hardened}).
   */
  stressors: VitalityFactor[];
  /**
   * Cost-of-living factors (units: %/h), charged as given against
   * `benefits` before anything else. Unpaid upkeep drains the bank and
   * then leaves the balance as `starved`; it never reaches condition.
   *
   * The array's presence is what declares the energy ledger, not what it
   * sums to: an array summing to zero — empty, or the all-zero factors a
   * plant at `upkeepCost: 0` builds — is a ledger that owes nothing, so
   * income banks and repair is a withdrawal the caller makes. Absence is
   * an organism with no separate energy ledger at all, healing on income
   * instead.
   */
  upkeep?: VitalityFactor[];
  /**
   * Hours of `upkeep` the bank keeps back from damage. The product
   * `upkeepRate × this` is the survival reserve: damage buffers against
   * whatever stands above it and reaches condition below it, so a
   * poisoned organism burns its spare down to survival rations and then
   * takes the hit on condition instead of starving itself. Defaults to
   * 0 — the whole bank buffers, which is what an organism with no
   * upkeep runs.
   */
  upkeepReserveHours?: number;
  /**
   * Benefit factors (units: %/h). Hardiness never scales benefits — a
   * hardy organism is damaged less, not energised more.
   */
  benefits: VitalityFactor[];
  /** Current condition (0–100). */
  condition: number;
  /**
   * Current banked surplus — the reserve. Unpaid upkeep drains it to the
   * last unit and damage drains what stands above the survival reserve;
   * positive overflow accrues back into it (capped). Clamped into
   * `[0, surplusCap]` on entry, so an over-cap value from an old save
   * self-heals on the first tick.
   */
  surplus: number;
  /**
   * Saturation cap for the bank. Accrual beyond it is discarded. A
   * negative cap is a nonsensical ceiling and is floored to 0 (an
   * always-empty bank), so surplus can never be driven below 0.
   */
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
  stressors: VitalityFactor[];
  upkeep: VitalityFactor[];
  benefits: VitalityFactor[];
  /** Total damage rate (%/h). */
  damageRate: number;
  /** Total cost of living (%/h). */
  upkeepRate: number;
  /**
   * Depth of the bank upkeep has spoken for — `upkeepRate ×
   * upkeepReserveHours`. Nothing but upkeep may spend below it, here or in
   * whatever the caller does with the bank afterwards.
   */
  reserved: number;
  /** Total benefit rate (%/h). */
  benefitRate: number;
  /** Net rate (benefit − upkeep − damage). Positive = recovering. */
  net: number;
  /**
   * Reserve drained from the bank this tick (%/h, ≥ 0), whichever
   * ledger spent it. Condition-100 with `drained > 0` is the "burning
   * reserves" signal — the organism reads full but is spending down its
   * buffer.
   */
  drained: number;
  /**
   * Share of `upkeepRate` (0–1) that neither income nor the bank could
   * pay. The caller turns this into tissue loss; a plant with nothing
   * banked and no light reads 1.
   */
  starved: number;
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
 * What a bank holds above a reserved depth — the only part of it any claim
 * junior to upkeep may take.
 *
 * The one definition of the floor. `bankSurplus` bounds a tick's damage by it,
 * and every caller that spends the bank on something else — a plant's repair,
 * its growth — bounds its withdrawal by the same call. A floor each claimant
 * subtracts for itself is a floor one of them forgets.
 */
export function spendableSurplus(bank: number, reserved: number): number {
  return Math.max(0, bank - Math.max(0, reserved));
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
 * `reserved` is the depth this claim may not reach — the part of the
 * bank a prior claim has already spoken for, so a fold that would drain
 * past it stops there and reports the rest as overflow. It is what
 * orders two claims on one bank without separating them: the senior
 * claim reserves nothing and spends to the last unit, the junior one
 * reserves what the senior will need. Accrual ignores it; a reserve is
 * a floor on spending, not a ceiling on saving.
 *
 * `cap` is floored to 0 first (a negative saturation ceiling is
 * nonsensical), then `bank` is clamped into `[0, cap]` on entry — so an
 * over-cap value from an old save self-heals on the first tick and no
 * caller can drive the bank negative (the persisted `surplus` schema
 * requires ≥ 0). Shared by `computeVitality` (fish / plants) and the
 * algae orchestrator so every organism type buffers damage identically.
 */
export function bankSurplus(
  bank: number,
  net: number,
  cap: number,
  accrue: boolean,
  reserved = 0
): SurplusBankTick {
  const safeCap = Math.max(0, cap);
  const start = clampBank(bank, safeCap);
  if (net < 0) {
    const drained = Math.min(spendableSurplus(start, reserved), -net);
    return { surplus: start - drained, drained, overflowDamage: -net - drained };
  }
  if (net > 0 && accrue) {
    return { surplus: Math.min(safeCap, start + net), drained: 0, overflowDamage: 0 };
  }
  // net === 0, or positive net with accrual gated off (overflow discarded).
  return { surplus: start, drained: 0, overflowDamage: 0 };
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
 * Compute one tick of vitality for an organism.
 *
 * Algorithm:
 * 1. upkeepRate = Σ upkeep.amount
 * 2. damageRate = Σ stressor.amount
 * 3. benefitRate = Σ benefit.amount
 * 4. Energy ledger — `benefitRate − upkeepRate`. A deficit drains the
 *    bank to the last unit; what the bank can't cover is reported as
 *    `starved` and reaches no stock here. A surplus is the income
 *    step 5 spends.
 * 5. Health ledger — that income against `damageRate`.
 *    - Negative: the bank buffers it down to the survival reserve
 *      (`upkeepRate × upkeepReserveHours`), and only what the spare
 *      couldn't cover bleeds condition. Condition stays put while the
 *      reserve holds the line, which is the "burning reserves" reading.
 *    - Positive: it accrues into the bank up to `surplusCap` (when
 *      `accrueSurplus`), except that an organism declaring no upkeep
 *      ledger heals with it first — it has no store to run, so income
 *      repairs it on the spot and only a full condition leaves anything
 *      over.
 *    - Zero: condition and bank unchanged (bank still clamped).
 *
 * The ordering in step 5 is the whole point of the reserve line. Damage
 * outweighs upkeep by an order of magnitude in every organism here, so a
 * bank damage may spend to the floor is a bank upkeep finds empty on the
 * next tick — which turns any nagging channel into starvation. Reserving
 * the survival rations keeps both readings: the spare absorbs damage,
 * and what it protects is the organism's ability to pay for being alive.
 *
 * For an organism that stores its energy, nothing here repairs
 * condition: repair is a withdrawal the caller makes from the bank,
 * ahead of growth, which is the "recover then grow" ladder with the bank
 * as the pool both rungs draw from. That withdrawal is junior to upkeep
 * exactly as damage is, so it is bounded by `breakdown.reserved` through
 * {@link spendableSurplus} — a floor damage stops at and repair steps over
 * gives the condition back one tick later out of the rations. For an
 * organism that does not store, healing burns the whole benefit budget
 * until the deficit is paid down — the same ladder from the other end.
 */
export function computeVitality(input: VitalityInput): VitalityResult {
  const sum = (factors: VitalityFactor[]): number =>
    factors.reduce((total, factor) => total + factor.amount, 0);

  const upkeep = input.upkeep ?? [];
  const upkeepRate = sum(upkeep);
  const damageRate = sum(input.stressors);
  const benefitRate = sum(input.benefits);

  const condition = Math.max(0, Math.min(100, input.condition));
  // Floor the cap at 0 — a negative saturation ceiling is nonsensical and
  // would otherwise clamp the bank negative, violating the persisted
  // `surplus >= 0` schema. bankSurplus floors independently; this covers
  // the idle-tick clampBank path below.
  const cap = Math.max(0, input.surplusCap);
  const accrue = input.accrueSurplus ?? true;

  // Declaring the ledger is what makes an organism a storing one, not owing
  // anything on it: `upkeepCost` reaches 0 on its own slider, and a plant there
  // still banks its income and repairs by withdrawal.
  const stores = input.upkeep !== undefined;
  // What that upkeep has already spoken for, and therefore how deep into
  // the bank the damage below may reach.
  const reserved = upkeepRate * (input.upkeepReserveHours ?? 0);

  let surplus = clampBank(input.surplus, cap);
  let drained = 0;
  let unpaidUpkeep = 0;

  // The energy ledger. Income pays the cost of living first, the reserve
  // pays what income couldn't, and what neither covered is `starved` —
  // reaching no stock here, because the tissue it comes out of is the
  // caller's to spend.
  const energyNet = benefitRate - upkeepRate;
  if (energyNet < 0) {
    const bank = bankSurplus(surplus, energyNet, cap, accrue);
    surplus = bank.surplus;
    drained += bank.drained;
    unpaidUpkeep = bank.overflowDamage;
  }

  const net = energyNet - damageRate;
  const conditionNet = Math.max(0, energyNet) - damageRate;
  let newCondition: number;

  if (conditionNet < 0) {
    // Damage exceeds the income left over — the spare above the survival
    // reserve soaks up what it can before condition takes the hit, and
    // only the shortfall it could not cover bleeds condition (clamped at
    // 0; downstream death checks compare against configured thresholds).
    const bank = bankSurplus(surplus, conditionNet, cap, accrue, reserved);
    surplus = bank.surplus;
    drained += bank.drained;
    newCondition = Math.max(0, condition - bank.overflowDamage);
  } else if (stores || condition >= 100) {
    // Nowhere for the income to go but the reserve — a storing organism
    // banks it at any condition and repairs out of the bank later, and one
    // at full condition has nothing left to repair. Accrual saturates at
    // the cap.
    surplus = bankSurplus(surplus, conditionNet, cap, accrue).surplus;
    newCondition = condition;
  } else {
    // conditionNet > 0 and condition < 100 → heal first, overshoot
    // discarded. (Or conditionNet === 0 → no change.)
    newCondition = Math.min(100, condition + conditionNet);
  }

  return {
    newCondition,
    surplus,
    breakdown: {
      stressors: input.stressors,
      upkeep,
      benefits: input.benefits,
      damageRate,
      upkeepRate,
      reserved,
      benefitRate,
      net,
      drained,
      starved: unpaidUpkeep > 0 ? unpaidUpkeep / upkeepRate : 0,
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
  return value < edge ? Math.log((edge + offset) / (Math.max(value, 0) + offset)) : 0;
}
