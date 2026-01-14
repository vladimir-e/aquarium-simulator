/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './core/effects.js';
import { coreSystems } from './systems/index.js';
import { processEquipment, calculatePassiveResources } from './equipment/index.js';
import { checkAlerts } from './alerts/index.js';

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
 * Then checks alerts and adds any triggered logs.
 * Returns a new state object (immutable).
 */
export function tick(state: SimulationState): SimulationState {
  // Increment tick counter and calculate passive resources
  let newState = produce(state, (draft) => {
    draft.tick += 1;
    // Calculate passive resources before processing effects
    // (used by future systems like nitrogen cycle and gas exchange)
    draft.passiveResources = calculatePassiveResources(draft);
  });

  // Tier 1: IMMEDIATE - Environmental effects, then equipment responses
  // First apply environmental effects (drift, evaporation)
  const immediateEffects = collectSystemEffects(newState, 'immediate');
  newState = applyEffects(newState, immediateEffects);

  // Then equipment responds to the updated state
  const equipmentResult = processEquipment(newState);
  newState = equipmentResult.state;
  newState = applyEffects(newState, equipmentResult.effects);

  // Tier 2: ACTIVE - Living processes (plants, livestock)
  const activeEffects = collectSystemEffects(newState, 'active');
  newState = applyEffects(newState, activeEffects);

  // Tier 3: PASSIVE - Natural processes (decay, nitrogen cycle, gas exchange)
  const passiveEffects = collectSystemEffects(newState, 'passive');
  newState = applyEffects(newState, passiveEffects);

  // Check alerts after all effects applied
  const alertResult = checkAlerts(newState);
  newState = produce(newState, (draft) => {
    // Update alert state (always, to track threshold crossings)
    draft.alertState = alertResult.alertState;
    // Add any triggered log entries
    if (alertResult.logs.length > 0) {
      draft.logs.push(...alertResult.logs);
    }
  });

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
