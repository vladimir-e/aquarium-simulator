/**
 * Core systems registry.
 */

export type { System } from './types.js';

export {
  temperatureDriftSystem,
  calculateTemperatureDrift,
  COOLING_COEFFICIENT,
  REFERENCE_VOLUME,
  VOLUME_EXPONENT,
} from './temperature-drift.js';

export {
  evaporationSystem,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
  LID_MULTIPLIERS,
  getLidMultiplier,
} from './evaporation.js';

export {
  decaySystem,
  getTemperatureFactor,
  calculateDecay,
  Q10,
  REFERENCE_TEMP,
  BASE_DECAY_RATE,
} from './decay.js';

export {
  algaeSystem,
  calculateAlgaeGrowth,
  getWattsPerGallon,
  MAX_GROWTH_RATE,
  HALF_SATURATION,
  BASE_GROWTH_RATE,
  ALGAE_CAP,
} from './algae.js';

export {
  nitrogenCycleSystem,
  calculateMaxBacteria,
  calculateBacterialGrowth,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
  WASTE_CONVERSION_RATE,
  BACTERIA_PROCESSING_RATE,
  AOB_SPAWN_THRESHOLD,
  NOB_SPAWN_THRESHOLD,
  SPAWN_AMOUNT,
  AOB_GROWTH_RATE,
  NOB_GROWTH_RATE,
  BACTERIA_PER_CM2,
  BACTERIA_DEATH_RATE,
  AOB_FOOD_THRESHOLD,
  NOB_FOOD_THRESHOLD,
} from './nitrogen-cycle.js';

export {
  gasExchangeSystem,
  calculateO2Saturation,
  calculateFlowFactor,
  calculateGasExchange,
  ATMOSPHERIC_CO2,
  O2_SATURATION_BASE,
  O2_SATURATION_SLOPE,
  O2_REFERENCE_TEMP,
  BASE_EXCHANGE_RATE,
  OPTIMAL_FLOW_TURNOVER,
} from './gas-exchange.js';

import type { System } from './types.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decaySystem } from './decay.js';
import { algaeSystem } from './algae.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { gasExchangeSystem } from './gas-exchange.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  algaeSystem,
  nitrogenCycleSystem,
  gasExchangeSystem,
];
