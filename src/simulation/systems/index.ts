/**
 * Core systems registry.
 */

export type { System } from './types.js';

export {
  temperatureDriftSystem,
  calculateTemperatureDrift,
  ambientTemperature,
} from './temperature-drift.js';

export {
  evaporationSystem,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  LID_MULTIPLIERS,
  getLidMultiplier,
} from './evaporation.js';

export {
  decompositionSystem,
  rotPace,
  poolShares,
  rotShare,
  decompose,
  decomposePools,
  organicPool,
  type PoolShares,
  type PoolHour,
} from './decomposition.js';

export { offerCarbon } from './photosynthesis.js';

export {
  saturationIrradiance,
  dailyLightEdge,
  floraPace,
  growthTaper,
  floraStressors,
  floraBenefits,
  type FloraTraits,
  type FloraVitalityInput,
} from './flora.js';

export {
  nitrogenCycleSystem,
  nitrificationFactor,
  nitrifierOxygenFactor,
  calculateMaxBacteria,
  calculateSeeding,
  calculateColonyFlows,
  ammoniaIn,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
  aobCapacity,
  nobCapacity,
  colonyRates,
} from './nitrogen-cycle.js';

export {
  gasExchangeSystem,
  calculateO2Saturation,
  calculateFlowFactor,
  calculateGasExchange,
} from './gas-exchange.js';

export {
  computeVitality,
  hardened,
  type VitalityFactor,
  type VitalityInput,
  type VitalityResult,
  type VitalityBreakdown,
} from './vitality.js';

import type { System } from './types.js';
import type { EffectTier } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { stockLeft } from '../core/kinetics.js';
import { sum } from '../core/sum.js';
import { getMassFromPpm, getPpm } from '../resources/helpers.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decompositionSystem } from './decomposition.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { gasExchangeSystem } from './gas-exchange.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  decompositionSystem,
  nitrogenCycleSystem,
  gasExchangeSystem,
];

/**
 * The oxygen, mg/L, a tier's systems run on: the level their draws on the one
 * stock leave the water at as the hour ends, so together they never take more
 * than it holds.
 */
export function tierOxygen(state: SimulationState, tier: EffectTier, config: TunableConfig): number {
  const { oxygen, water } = state.resources;
  const draws = coreSystems.flatMap((system) => (system.tier === tier && system.oxygenDraw ? [system.oxygenDraw] : []));
  if (draws.length === 0 || water <= 0) return oxygen;
  const left = stockLeft(getMassFromPpm(oxygen, water), (mg) =>
    sum(draws.map((draw) => draw(state, getPpm(mg, water), config)))
  );
  return getPpm(left, water);
}
