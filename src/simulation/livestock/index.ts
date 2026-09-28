/**
 * Livestock processing - handles fish metabolism and health.
 *
 * Called during ACTIVE tier processing in tick.ts (after plants).
 * Returns updated state and effects for resource changes.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import { livestockDefaults } from '../config/livestock.js';
import { processMetabolism, type MetabolismResult } from '../systems/metabolism.js';
import type { VitalityResult } from '../systems/vitality.js';
import { processHealth } from '../systems/fish-health.js';
import { createLog } from '../core/logging.js';
import { clutchOrganics, clutchesWithMothers } from '../systems/clutch.js';
import { getPpm } from '../resources/index.js';

export interface LivestockProcessingResult {
  /** Updated state with modified fish */
  state: SimulationState;
  /** Effects for resource changes (food, waste, O2, CO2) */
  effects: Effect[];
  /** What the fish ate, passed and breathed this tick */
  metabolism: MetabolismResult;
  /** Each fish's vitality this tick, in `state.fish` order, the dead included */
  vitalities: VitalityResult[];
}

/**
 * Process livestock for one tick.
 *
 * Handles:
 * 1. Metabolism: digestion, eating, respiration, age
 * 2. Health: stressor calculations, health recovery/damage, death
 *
 * What the fish digested is excreted by `processBreeding`, once growth has
 * built its share into their bodies.
 */
export function processLivestock(
  state: SimulationState,
  config: TunableConfig
): LivestockProcessingResult {
  const effects: Effect[] = [];
  const livestockConfig = config.livestock ?? livestockDefaults;

  const metabolismResult = processMetabolism(state.fish, state.resources, livestockConfig);

  if (state.fish.length === 0) {
    return { state, effects, metabolism: metabolismResult, vitalities: [] };
  }

  // Add metabolism effects
  if (metabolismResult.foodConsumed > 0) {
    effects.push({
      tier: 'active',
      resource: 'food',
      delta: -metabolismResult.foodConsumed,
      source: 'fish-metabolism',
    });
  }

  const waterVolume = state.resources.water;
  const oxygenDrawn = getPpm(metabolismResult.oxygenConsumedMg, waterVolume);
  if (oxygenDrawn > 0) {
    effects.push({
      tier: 'active',
      resource: 'oxygen',
      delta: -oxygenDrawn,
      source: 'fish-respiration',
    });
  }

  const co2Exhaled = getPpm(metabolismResult.co2ProducedMg, waterVolume);
  if (co2Exhaled > 0) {
    effects.push({
      tier: 'active',
      resource: 'co2',
      delta: co2Exhaled,
      source: 'fish-respiration',
    });
  }

  const carried = new Map<string, number>();
  for (const clutch of state.clutches) {
    const mother = clutch.motherId;
    if (mother !== undefined) carried.set(mother, (carried.get(mother) ?? 0) + clutchOrganics(clutch, livestockConfig));
  }
  const healthResult = processHealth(
    metabolismResult.updatedFish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    livestockConfig,
    metabolismResult.digested,
    metabolismResult.metabolicFactor,
    metabolismResult.updatedFish.map((fish) => carried.get(fish.id) ?? 0)
  );

  // Add death waste effects
  if (healthResult.deathWaste > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: healthResult.deathWaste,
      source: 'fish-death',
    });
  }

  // Update fish in state and log deaths
  const newState = produce(state, (draft) => {
    draft.fish = healthResult.survivingFish;
    draft.clutches = clutchesWithMothers(draft.clutches, draft.fish);

    for (const fishName of healthResult.deadFishNames) {
      draft.logs.push(
        createLog(
          draft.tick,
          'simulation',
          'warning',
          `${fishName} died`,
          'fish-died'
        )
      );
    }
  });

  return {
    state: newState,
    effects,
    metabolism: metabolismResult,
    vitalities: healthResult.vitalities,
  };
}
