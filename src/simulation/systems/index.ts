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
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
  LID_MULTIPLIERS,
  getLidMultiplier,
} from './evaporation.js';

import type { System } from './types.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
];
