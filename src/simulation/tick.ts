/**
 * Tick processing - advances simulation by one time unit.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';
import { applyEffects, type Effect, type EffectTier } from './core/effects.js';
import { coreSystems } from './systems/index.js';
import { processEquipment, calculatePassiveResources } from './equipment/index.js';
import { processPlants } from './plants/index.js';
import { processAlgae } from './algae/index.js';
import { processLivestock } from './livestock/index.js';
import { processBreeding } from './livestock/breeding.js';
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
 * Plants, algae and livestock all run against this rather than against the state
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
    const passiveValues = calculatePassiveResources(draft, config.optics);
    draft.resources.surface = passiveValues.surface;
    draft.resources.flow = passiveValues.flow;
    draft.resources.light = passiveValues.light;
    draft.resources.aeration = passiveValues.aeration;
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

  // Tier 2: ACTIVE - Living processes (plants, algae, livestock).
  // Order matters: algae stressors / benefits read freshly-updated
  // plant condition (suppression and weakness factors) and the
  // shared `getPlantPower` reads each plant's current condition.
  // Running algae before plants would lag the suppression signal by
  // one tick.
  const plantsResult = processPlants(newState, config);
  newState = plantsResult.state;
  newState = applyEffects(newState, plantsResult.effects, config);

  // Algae uses the just-updated plant.condition to compute power.
  const algaeResult = processAlgae(newState, config);
  newState = algaeResult.state;

  // Livestock can now read current algae mass if it ever needs to
  // (no current dependency, but the order keeps the read graph
  // monotone from immediate → equipment → plants → algae →
  // livestock → other-active → passive).
  const livestockResult = processLivestock(newState, config);
  newState = livestockResult.state;
  newState = applyEffects(newState, livestockResult.effects, config);

  // Reproduction reads the surplus banks livestock just updated and the
  // per-fish net rates from the same health pass. It's an orchestrator,
  // not an effect source, because it adds organisms (fry, clutches).
  const breedingResult = processBreeding(newState, config, livestockResult.netByFishId);
  newState = breedingResult.state;

  // Then other active systems
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
