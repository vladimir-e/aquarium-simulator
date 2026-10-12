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
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decompositionSystem } from './decomposition.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { gasExchangeSystem } from './gas-exchange.js';

/** All core systems in the simulation, in the order their effects land: the air's oxygen before the draws it supports. */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  gasExchangeSystem,
  decompositionSystem,
  nitrogenCycleSystem,
];

/**
 * The oxygen, mg/L, a tier's systems run on: the level all their draws on the
 * one stock leave the water at as the hour ends, so together they never take
 * more than it holds. The air draws too, negatively below saturation; what the
 * tier would give an empty water counts as stock, so every draw read against
 * it takes nothing from an empty one.
 */
export function tierOxygen(state: SimulationState, tier: EffectTier, config: TunableConfig): number {
  const draws = coreSystems.flatMap((system) => (system.tier === tier && system.oxygenDraw ? [system.oxygenDraw] : []));
  const drawn = (oxygen: number): number => sum(draws.map((draw) => draw(state, oxygen, config)));
  const given = -drawn(0);
  return stockLeft(state.resources.oxygen + given, (oxygen) => drawn(oxygen) + given);
}
