/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './effects.js';

/**
 * Collects effects for a given tier.
 * Currently returns empty arrays - systems will be added in future tasks.
 */
function collectEffects(_state: SimulationState, _tier: EffectTier): Effect[] {
  // Future: Equipment, plants, livestock, and core systems will contribute effects here
  return [];
}

/**
 * Advances the simulation by one tick (1 hour).
 * Processes effects in three tiers: immediate → active → passive.
 * Returns a new state object (immutable).
 */
export function tick(state: SimulationState): SimulationState {
  // Increment tick counter
  let newState = produce(state, (draft) => {
    draft.tick += 1;
  });

  // Process effects in tier order
  const tiers: EffectTier[] = ['immediate', 'active', 'passive'];

  for (const tier of tiers) {
    const effects = collectEffects(newState, tier);
    newState = applyEffects(newState, effects);
  }

  return newState;
}

/**
 * Helper to get the hour of day (0-23) from current tick.
 */
export function getHourOfDay(state: SimulationState): number {
  return state.tick % 24;
}

/**
 * Helper to get the day number from current tick.
 */
export function getDayNumber(state: SimulationState): number {
  return Math.floor(state.tick / 24);
}
