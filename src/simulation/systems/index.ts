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
  updateNitrogenCycle,
  calculateMaxBacteriaCapacity,
  wasteToAmmoniaPPM,
  calculateBacteriaGrowth,
  calculateBacteriaDeath,
  MAX_WASTE_CONVERSION_PER_HOUR,
  WASTE_TO_AMMONIA_FACTOR,
  NH3_TO_NO2_RATIO,
  NO2_TO_NO3_RATIO,
  AOB_CONVERSION_RATE,
  NOB_CONVERSION_RATE,
  BACTERIA_DOUBLING_TIME,
  BACTERIA_GROWTH_RATE,
  BACTERIA_STARVATION_DAYS,
  BACTERIA_DEATH_RATE,
  MIN_FOOD_AOB,
  MIN_FOOD_NOB,
  SPAWN_THRESHOLD_AOB,
  SPAWN_THRESHOLD_NOB,
  INITIAL_BACTERIA_SPAWN,
  BACTERIA_PER_CM2,
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
