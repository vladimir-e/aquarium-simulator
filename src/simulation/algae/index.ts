/**
 * Algae processing — the tank-wide bloom as a living organism.
 *
 * Pipeline (mirrors `plants/index.ts`):
 * 1. Vitality: read environment + plant power, compute stressors /
 *    benefits, drive `condition` and emit per-tick surplus.
 * 2. Bank surplus on `algae.surplus`. **Photoperiod-gated**:
 *    surplus represents stored photosynthate, so banking only
 *    happens while lights are on. Vitality's surplus emission
 *    overnight is discarded.
 * 3. Spend surplus on mass growth: drains up to
 *    `algaeGrowthPerTickCap` per tick, converts to mass via the
 *    asymptotic factor (`max(0, 1 - mass/100)`) — same shape as
 *    plant growth. Also photoperiod-gated.
 * 4. Mass decay: when `condition < 100`, lose
 *    `decayRate × (1 - condition/100) × mass` per tick. Decay
 *    runs 24/7 (a suppressed bloom dies back at night too) and
 *    fires only when condition is below full — the spec's
 *    monotonicity invariant for healthy blooms.
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
import { computeAlgaeVitality } from '../systems/algae-vitality.js';
import type { AlgaeVitalityConfig } from '../config/algae-vitality.js';

export interface AlgaeProcessingResult {
  /** Updated state with algae condition / mass / surplus written. */
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
 * Apply mass decay for one tick. Fires only when `condition < 100`;
 * a fully-healthy bloom is monotonically non-decreasing through this
 * step (scrub remains the only way to remove a healthy bloom). At
 * `condition = 0` the bloom bleeds at full `decayRate × mass`.
 */
export function applyMassDecay(
  algae: AlgaeState,
  config: AlgaeVitalityConfig
): AlgaeState {
  if (algae.condition >= 100 || algae.mass <= 0) return algae;
  const lossFactor = 1 - algae.condition / 100;
  const massLoss = config.decayRate * lossFactor * algae.mass;
  return { ...algae, mass: Math.max(0, algae.mass - massLoss) };
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

  const vitality = computeAlgaeVitality({
    algae: state.algae,
    plants: state.plants,
    resources: state.resources,
    tankCapacity: state.tank.capacity,
    algaeConfig,
    nutrientsConfig,
  });

  const photoperiodActive = state.resources.light > 0;

  // 1. Apply condition update + bank surplus (photoperiod-gated).
  let next: AlgaeState = {
    ...state.algae,
    condition: vitality.newCondition,
    surplus: photoperiodActive
      ? state.algae.surplus + vitality.surplus
      : state.algae.surplus,
  };

  // 2. Spend surplus on mass growth (photoperiod-gated).
  if (photoperiodActive) {
    next = spendAlgaeSurplus(next, algaeConfig);
  }

  // 3. Mass decay — runs 24/7, only when condition < 100.
  next = applyMassDecay(next, algaeConfig);

  const newState = produce(state, (draft) => {
    draft.algae = next;
  });

  return { state: newState };
}

// Re-export the vitality math for tests and UI introspection.
export {
  computeAlgaeVitality,
  buildAlgaeStressors,
  buildAlgaeBenefits,
} from '../systems/algae-vitality.js';
