/**
 * Core systems registry.
 */

export type { System } from './types.js';

export {
  temperatureDriftSystem,
  calculateTemperatureDrift,
} from './temperature-drift.js';

export {
  evaporationSystem,
  calculateEvaporation,
  calculateEvaporationRatePerDay,
  LID_MULTIPLIERS,
  getLidMultiplier,
} from './evaporation.js';

export {
  decaySystem,
  getTemperatureFactor,
  calculateDecay,
} from './decay.js';

export {
  algaeSystem,
  calculateAlgaeGrowth,
  getWattsPerGallon,
  calculatePlantCompetitionFactor,
} from './algae.js';

export {
  calculatePhotosynthesis,
  getTotalPlantSize,
  calculateCo2Factor,
  calculateNitrateFactor,
} from './photosynthesis.js';

export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from './respiration.js';

export {
  distributeBiomass,
  getMaxPlantSize,
  calculateOvergrowthPenalty,
  getSpeciesGrowthRate,
} from './plant-growth.js';

export {
  nitrogenCycleSystem,
  calculateMaxBacteria,
  calculateBacterialGrowth,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
} from './nitrogen-cycle.js';

export {
  gasExchangeSystem,
  calculateO2Saturation,
  calculateFlowFactor,
  calculateGasExchange,
} from './gas-exchange.js';

export {
  phDriftSystem,
  calculateHardscapeTargetPH,
  calculateCO2PHEffect,
} from './ph-drift.js';

import type { System } from './types.js';
import { temperatureDriftSystem } from './temperature-drift.js';
import { evaporationSystem } from './evaporation.js';
import { decaySystem } from './decay.js';
import { algaeSystem } from './algae.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { gasExchangeSystem } from './gas-exchange.js';
import { phDriftSystem } from './ph-drift.js';

/** All core systems in the simulation */
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
  decaySystem,
  algaeSystem,
  nitrogenCycleSystem,
  gasExchangeSystem,
  phDriftSystem,
];
