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
  BASE_GROWTH_RATE,
  ALGAE_CAP,
} from './algae.js';

import type { System } from './types.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decaySystem } from './decay.js';
import { algaeSystem } from './algae.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  algaeSystem,
];
