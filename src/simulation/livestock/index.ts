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
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { processMetabolism, type MetabolismResult } from '../systems/metabolism.js';
import { mintAmmonia } from '../systems/nitrogen-cycle.js';
import type { VitalityResult } from '../systems/vitality.js';
import { processHealth } from '../systems/fish-health.js';
import { createLog } from '../core/logging.js';
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
 * 1. Metabolism: food consumption, waste/CO2 production, satiation/age updates
 * 2. Health: stressor calculations, health recovery/damage, death
 */
export function processLivestock(
  state: SimulationState,
  config: TunableConfig
): LivestockProcessingResult {
  const effects: Effect[] = [];
  const livestockConfig = config.livestock ?? livestockDefaults;

  // 1. Process metabolism (food consumption, waste, respiration, satiation, age)
  const metabolismResult = processMetabolism(
    state.fish,
    state.resources.food,
    state.resources.oxygen,
    livestockConfig,
    config.nutrients.foodMineralContent
  );

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

  if (metabolismResult.wasteProduced > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: metabolismResult.wasteProduced,
      source: 'fish-metabolism',
    });
  }

  // Direct ammonia excretion via gills (ammoniotelic pathway).
  // Stored as NH3 compound mass (mg); MW scaling handled in metabolism.
  if (metabolismResult.ammoniaProduced > 0) {
    effects.push(...mintAmmonia(metabolismResult.ammoniaProduced, 'active', 'fish-gill-excretion'));
  }

  for (const nutrient of WASTE_NUTRIENTS) {
    const excreted = metabolismResult.mineralsExcreted[nutrient];
    if (excreted > 0) {
      effects.push({
        tier: 'active',
        resource: nutrient,
        delta: excreted,
        source: 'fish-gill-excretion',
      });
    }
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

  // 2. Process health (stressors, recovery, death)
  const healthResult = processHealth(
    metabolismResult.updatedFish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    livestockConfig
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

// Re-export for testing and external use
export { processMetabolism } from '../systems/metabolism.js';
export { processHealth, computeFishVitality, fishHealingRate } from '../systems/fish-health.js';
export { processBreeding } from './breeding.js';
export { createFish, fishMassForAge } from './create-fish.js';
