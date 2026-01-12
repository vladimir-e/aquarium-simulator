/**
 * Simulation module - core simulation engine exports.
 */

export type {
  SimulationState,
  SimulationConfig,
  Tank,
  Resources,
} from './state.js';
export { createSimulation } from './state.js';

export type { Effect, EffectTier, ResourceKey } from './effects.js';
export { applyEffects } from './effects.js';

export { tick, getHourOfDay, getDayNumber } from './tick.js';
