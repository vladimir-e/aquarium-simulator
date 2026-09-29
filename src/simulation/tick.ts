/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './core/effects.js';
import { coreSystems } from './systems/index.js';
import { processEquipment, writePassiveResources } from './equipment/index.js';
import { processFlora } from './flora/index.js';
import { processLivestock } from './livestock/index.js';
import { processBodies } from './livestock/bodies.js';
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
 * The hour as the living tier meets it: the clock advanced, the passive
 * resources recalculated off the new hour — light among them — the environment's
 * own drift and evaporation applied, and the equipment's response to what they
 * left.
 *
 * The flora and the livestock both run against this rather than against the state
 * the tick was handed, so this is also the state anything measuring what a tick
 * did to them has to read. It is a pure function of `state`, so a measurement
 * can rebuild it from the same input and get the hour the tick actually ran.
 */
export function settleEnvironment(
  state: SimulationState,
  config: TunableConfig = DEFAULT_CONFIG
): SimulationState {
  let settled = produce(state, (draft) => {
    draft.tick += 1;
    writePassiveResources(draft, config.optics);
    draft.resources.lightByHour[draft.tick % 24] = draft.resources.light;
  });

  settled = applyEffects(settled, collectSystemEffects(settled, 'immediate', config), config);

  const equipmentResult = processEquipment(settled, config);
  return applyEffects(equipmentResult.state, equipmentResult.effects, config);
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
  // Tier 1: IMMEDIATE - Environmental effects, then equipment responses
  let newState = settleEnvironment(state, config);

  // Tier 2: ACTIVE - Living processes: plants and the blooms in one pass, then
  // livestock, which read the planting as the flora leave it.
  const floraResult = processFlora(newState, config);
  newState = applyEffects(floraResult.state, floraResult.effects, config);

  const livestockResult = processLivestock(newState, config);
  newState = livestockResult.state;
  newState = applyEffects(newState, livestockResult.effects, config);

  // The fish's bodies — clutches, broods and growth — read the banks
  // livestock just updated, and growth builds from the hour's digestion
  // before the rest is excreted.
  const bodiesResult = processBodies(newState, config, livestockResult.metabolism);
  newState = applyEffects(bodiesResult.state, bodiesResult.effects, config);

  // Then other active systems
  const activeEffects = collectSystemEffects(newState, 'active', config);
  newState = applyEffects(newState, activeEffects, config);

  // Tier 3: PASSIVE - Natural processes (decay, nitrogen cycle, gas exchange)
  const passiveEffects = collectSystemEffects(newState, 'passive', config);
  newState = applyEffects(newState, passiveEffects, config);

  // Check alerts after all effects applied
  const alertResult = checkAlerts(newState, config);
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
