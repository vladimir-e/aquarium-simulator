/**
 * Algae processing — the tank-wide bloom as a pure population.
 *
 * Pipeline:
 * 1. Compute net rate via `computeAlgaePopulation` (sum benefits −
 *    sum hardened stressors).
 * 2. Fold the net rate into the surplus reserve bank via `bankSurplus`:
 *    positive net accrues (capped, photoperiod-gated), negative net drains
 *    the bank before it touches mass. Surplus is photoperiod-gated
 *    photosynthate; vitality's positive rate overnight is discarded.
 * 3. Shrink mass by the drain *overflow* — the damage the bank couldn't
 *    cover. Runs 24/7 — a hostile-environment bloom burns reserves then
 *    dies back, at night too. A well-stocked bloom shrugs off a bad tick.
 * 4. Spend surplus on mass growth via `spendAlgaeSurplus`. Drains up
 *    to `algaeGrowthPerTickCap` per tick, converted to mass through
 *    the asymptotic factor `max(0, 1 - mass/100)` — same shape as
 *    plant growth, self-limits at MASS_MAX. Photoperiod-gated.
 *
 * No condition state. Conditions favouring algae grow it; conditions
 * hostile to it shrink it. The shape mirrors the future colony
 * organisms (snails, shrimps) — populations responding to net
 * environmental pressure.
 *
 * Sequenced **after plants** in `tick.ts` so the suppression and
 * weakness factors read freshly-updated plant condition. If algae
 * ran first, plant power would be one tick stale and stressors
 * would lag behaviour by ~1 hour.
 *
 * No effect emission. Algae mass changes happen in-place on
 * `state.algae`; nothing else in the engine reads algae as a
 * resource (the plant-side `algae_shading` stressor reads
 * `state.algae.mass` directly).
 */

import { produce } from 'immer';
import type { SimulationState, AlgaeState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { computeAlgaePopulation } from '../systems/algae-vitality.js';
import type { AlgaeVitalityConfig } from '../config/algae-vitality.js';

export interface AlgaeProcessingResult {
  /** Updated state with algae mass / surplus written. */
  state: SimulationState;
}

const MASS_MAX = 100;

/** Outcome of folding one tick's net rate into the bloom's bank. */
export interface SurplusBankTick {
  /** Bank after this tick, within `[0, cap]`. */
  surplus: number;
  /** Reserve drained to absorb damage (≥ 0). */
  drained: number;
  /** Damage that outran the bank and reaches mass (≥ 0). */
  overflowDamage: number;
}

/**
 * Fold one tick's net rate into the bloom's saturating bank. Damage drains
 * the bank first and only what it couldn't cover reaches mass; benefit
 * accrues up to `cap` when `accrue` is set, discarding the rest. The bank is
 * clamped into `[0, cap]` on entry, with a negative cap read as 0.
 *
 * The bloom's own path, not the vitality model: algae keeps no condition.
 */
export function bankSurplus(
  bank: number,
  net: number,
  cap: number,
  accrue: boolean
): SurplusBankTick {
  const safeCap = Math.max(0, cap);
  const start = Math.min(safeCap, Math.max(0, bank));
  if (net < 0) {
    const drained = Math.min(start, -net);
    return { surplus: start - drained, drained, overflowDamage: -net - drained };
  }
  if (net > 0 && accrue) {
    return { surplus: Math.min(safeCap, start + net), drained: 0, overflowDamage: 0 };
  }
  return { surplus: start, drained: 0, overflowDamage: 0 };
}

/**
 * Drain up to `algaeGrowthPerTickCap` from the surplus bank and
 * convert to mass via the asymptotic factor `max(0, 1 - mass / 100)`.
 *
 * The asymptotic factor self-limits the bloom at `MASS_MAX`: it keeps
 * drawing surplus at full rate but gets less mass per unit drawn as it
 * approaches saturation. Returns the post-spend `AlgaeState`.
 *
 * Unlike a plant, which withdraws only what converts, the bloom burns
 * what it draws, so `AlgaeState.surplus` reads near zero.
 */
export function spendAlgaeSurplus(
  algae: AlgaeState,
  config: AlgaeVitalityConfig
): AlgaeState {
  if (algae.surplus <= 0) return algae;
  const drained = Math.min(algae.surplus, config.algaeGrowthPerTickCap);
  const factor = Math.max(0, 1 - algae.mass / MASS_MAX);
  const massIncrease = drained * factor * config.massPerSurplus;
  return {
    ...algae,
    mass: Math.min(MASS_MAX, algae.mass + massIncrease),
    surplus: algae.surplus - drained,
  };
}

/**
 * Process algae for one tick. See module docstring for the
 * pipeline shape.
 *
 * @param state - Current simulation state (plants must already be
 *   updated this tick; tick.ts enforces ordering).
 * @param config - Tunable configuration.
 */
export function processAlgae(
  state: SimulationState,
  config: TunableConfig
): AlgaeProcessingResult {
  const algaeConfig = config.algae;

  const { net } = computeAlgaePopulation({
    plants: state.plants,
    resources: state.resources,
    algaeConfig,
  });

  const photoperiodActive = state.resources.light > 0;

  const bank = bankSurplus(
    state.algae.surplus,
    net,
    algaeConfig.surplusCap,
    photoperiodActive
  );
  let next: AlgaeState = { ...state.algae, surplus: bank.surplus };

  if (bank.overflowDamage > 0) {
    next = { ...next, mass: Math.max(0, next.mass - bank.overflowDamage) };
  }

  if (photoperiodActive) {
    next = spendAlgaeSurplus(next, algaeConfig);
  }

  const newState = produce(state, (draft) => {
    draft.algae = next;
  });

  return { state: newState };
}

// Re-export the population math for tests and UI introspection.
export {
  computeAlgaePopulation,
  buildAlgaeStressors,
  buildAlgaeBenefits,
} from '../systems/algae-vitality.js';
export type {
  AlgaeVitalityContext,
  AlgaePopulationResult,
  AlgaePopulationBreakdown,
} from '../systems/algae-vitality.js';
