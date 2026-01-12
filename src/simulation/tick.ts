/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './effects.js';
import { coreSystems } from './systems/index.js';
import { processEquipment } from './equipment/index.js';

/**
 * Collects effects from core systems for a given tier.
 */
function collectSystemEffects(
  state: SimulationState,
  tier: EffectTier
): Effect[] {
  const effects: Effect[] = [];

  for (const system of coreSystems) {
    if (system.tier === tier) {
      effects.push(...system.update(state));
    }
  }

  return effects;
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

  // Tier 1: IMMEDIATE - Equipment and user actions
  const equipmentResult = processEquipment(newState);
  newState = equipmentResult.state;
  newState = applyEffects(newState, equipmentResult.effects);

  // Tier 2: ACTIVE - Living processes (plants, livestock)
  const activeEffects = collectSystemEffects(newState, 'active');
  newState = applyEffects(newState, activeEffects);

  // Tier 3: PASSIVE - Natural processes (temperature drift, evaporation)
  const passiveEffects = collectSystemEffects(newState, 'passive');
  newState = applyEffects(newState, passiveEffects);

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
