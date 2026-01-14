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
  calculateMaxBacteriaCapacity,
  calculateFoodFactor,
  calculateCapacityFactor,
  calculateWasteConversion,
  calculateAOBConversion,
  calculateNOBConversion,
  calculateBacteriaChange,
  gramsToPpm,
  ppmToGrams,
  WASTE_TO_AMMONIA_RATE,
  AOB_CONVERSION_RATE,
  NOB_CONVERSION_RATE,
  NH3_TO_NO2_RATIO,
  AOB_GROWTH_RATE,
  NOB_GROWTH_RATE,
  AOB_DEATH_RATE,
  NOB_DEATH_RATE,
  MIN_FOOD_AOB,
  MIN_FOOD_NOB,
  BACTERIA_PER_CM2,
  INITIAL_AOB_FRACTION,
  INITIAL_NOB_FRACTION,
} from './nitrogen-cycle.js';

import type { System } from './types.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decaySystem } from './decay.js';
import { algaeSystem } from './algae.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  algaeSystem,
  nitrogenCycleSystem,
];
