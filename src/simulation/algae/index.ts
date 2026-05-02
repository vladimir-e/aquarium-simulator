/**
 * Algae processing — the tank-wide bloom as a pure population.
 *
 * Pipeline:
 * 1. Compute net rate via `computeAlgaePopulation` (sum benefits −
 *    sum stressors, with hardiness applied centrally).
 * 2. If net > 0 *and* lights are on, bank `net` on `algae.surplus`.
 *    Surplus is photoperiod-gated photosynthate; vitality's positive
 *    rate overnight is discarded.
 * 3. If net < 0, shrink mass directly: `mass = max(0, mass + net)`.
 *    Runs 24/7 — a hostile-environment bloom dies back at night too.
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
import { algaeVitalityDefaults } from '../config/algae-vitality.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { computeAlgaePopulation } from '../systems/algae-vitality.js';
import type { AlgaeVitalityConfig } from '../config/algae-vitality.js';

export interface AlgaeProcessingResult {
  /** Updated state with algae mass / surplus written. */
  state: SimulationState;
}

const MASS_MAX = 100;

/**
 * Drain up to `algaeGrowthPerTickCap` from the surplus bank and
 * convert to mass via the asymptotic factor `max(0, 1 - mass / 100)`.
 *
 * Asymptotic-factor self-limits at `MASS_MAX` exactly the way
 * `spendSurplusOnGrowth` does for plants: the bloom keeps drawing
 * surplus at full rate but gets less mass per unit drawn as it
 * approaches saturation. Returns the post-spend `AlgaeState`.
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
  const algaeConfig = config.algae ?? algaeVitalityDefaults;
  const nutrientsConfig = config.nutrients ?? nutrientsDefaults;

  const { net } = computeAlgaePopulation({
    plants: state.plants,
    resources: state.resources,
    tankCapacity: state.tank.capacity,
    algaeConfig,
    nutrientsConfig,
  });

  const photoperiodActive = state.resources.light > 0;

  let next: AlgaeState = state.algae;

  // 1. Positive net — bank as surplus (photoperiod-gated).
  if (net > 0 && photoperiodActive) {
    next = { ...next, surplus: next.surplus + net };
  }

  // 2. Negative net — shrink mass directly (24/7).
  if (net < 0) {
    next = { ...next, mass: Math.max(0, next.mass + net) };
  }

  // 3. Spend surplus on mass growth (photoperiod-gated). The
  //    asymptotic factor self-limits the bloom at MASS_MAX.
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
