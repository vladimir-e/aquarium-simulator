/**
 * Simulation module - core simulation engine exports.
 */

export type {
  SimulationState,
  SimulationConfig,
  Tank,
  Resources,
  Environment,
  Heater,
  Equipment,
} from './state.js';
export { createSimulation, DEFAULT_HEATER } from './state.js';

export type { Effect, EffectTier, ResourceKey } from './effects.js';
export { applyEffects } from './effects.js';

export { tick, getHourOfDay, getDayNumber } from './tick.js';

// Systems
export type { System } from './systems/index.js';
export {
  coreSystems,
  temperatureDriftSystem,
  evaporationSystem,
  calculateTemperatureDrift,
  calculateEvaporation,
  COOLING_COEFFICIENT,
  REFERENCE_VOLUME,
  VOLUME_EXPONENT,
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
} from './systems/index.js';

// Equipment
export {
  processEquipment,
  heaterUpdate,
  applyHeaterStateChange,
  calculateHeatingRate,
} from './equipment/index.js';
