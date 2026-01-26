/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './core/effects.js';
import { coreSystems } from './systems/index.js';
import { processEquipment, calculatePassiveResources } from './equipment/index.js';
import { checkAlerts } from './alerts/index.js';
import { type TunableConfig, DEFAULT_CONFIG } from './config/index.js';

/**
 * Collects effects from core systems for a given tier.
 */
function collectSystemEffects(
  state: SimulationState,
  tier: EffectTier,
  config: TunableConfig
): Effect[] {
  const effects: Effect[] = [];

  for (const system of coreSystems) {
    if (system.tier === tier) {
      effects.push(...system.update(state, config));
    }
  }

  return effects;
}

/**
 * Advances the simulation by one tick (1 hour).
 * Processes effects in three tiers: immediate → active → passive.
 * Then checks alerts and adds any triggered logs.
 * Returns a new state object (immutable).
 *
 * @param state - Current simulation state
 * @param config - Tunable configuration (defaults to DEFAULT_CONFIG)
 */
export function tick(
  state: SimulationState,
  config: TunableConfig = DEFAULT_CONFIG
): SimulationState {
  // Increment tick counter and calculate passive resources
  let newState = produce(state, (draft) => {
    draft.tick += 1;
    // Calculate passive resources before processing effects
    // (used by systems like algae growth that depend on light)
    const passiveValues = calculatePassiveResources(draft);
    draft.resources.surface = passiveValues.surface;
    draft.resources.flow = passiveValues.flow;
    draft.resources.light = passiveValues.light;
  });

  // Tier 1: IMMEDIATE - Environmental effects, then equipment responses
  // First apply environmental effects (drift, evaporation)
  const immediateEffects = collectSystemEffects(newState, 'immediate', config);
  newState = applyEffects(newState, immediateEffects, config);

  // Then equipment responds to the updated state
  const equipmentResult = processEquipment(newState);
  newState = equipmentResult.state;
  newState = applyEffects(newState, equipmentResult.effects, config);

  // Tier 2: ACTIVE - Living processes (plants, livestock)
  const activeEffects = collectSystemEffects(newState, 'active', config);
  newState = applyEffects(newState, activeEffects, config);

  // Tier 3: PASSIVE - Natural processes (decay, nitrogen cycle, gas exchange)
  const passiveEffects = collectSystemEffects(newState, 'passive', config);
  newState = applyEffects(newState, passiveEffects, config);

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
