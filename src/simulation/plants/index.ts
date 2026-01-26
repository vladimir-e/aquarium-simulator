/**
 * Plants processing - handles photosynthesis, respiration, and growth.
 *
 * Similar to equipment processing, this returns both updated state
 * (for plant sizes) and effects (for resource changes).
 *
 * Called during ACTIVE tier processing in tick.ts.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import {
  calculatePhotosynthesis,
  getTotalPlantSize,
} from '../systems/photosynthesis.js';
import { calculateRespiration } from '../systems/respiration.js';
import { distributeBiomass } from '../systems/plant-growth.js';

export interface PlantsProcessingResult {
  /** Updated state with modified plant sizes */
  state: SimulationState;
  /** Effects for resource changes (O2, CO2, nitrate, waste) */
  effects: Effect[];
}

/**
 * Process plants for one tick.
 *
 * Handles:
 * 1. Photosynthesis (when lights on): O2 production, CO2/nitrate consumption, biomass
 * 2. Respiration (24/7): O2 consumption, CO2 production
 * 3. Growth: biomass distribution to plants, overgrowth handling
 *
 * @param state - Current simulation state
 * @param config - Tunable configuration
 * @returns Updated state and resource effects
 */
export function processPlants(
  state: SimulationState,
  config: TunableConfig
): PlantsProcessingResult {
  const effects: Effect[] = [];
  const plantsConfig = config.plants ?? plantsDefaults;

  // Get total plant size
  const totalPlantSize = getTotalPlantSize(state.plants);

  // Skip if no plants
  if (state.plants.length === 0 || totalPlantSize === 0) {
    return { state, effects };
  }

  // 1. Calculate photosynthesis (only when light > 0)
  const photosynthesisResult = calculatePhotosynthesis(
    totalPlantSize,
    state.resources.light,
    state.resources.co2,
    state.resources.nitrate,
    state.resources.water,
    plantsConfig
  );

  // Add photosynthesis effects
  if (photosynthesisResult.oxygenDelta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'oxygen',
      delta: photosynthesisResult.oxygenDelta,
      source: 'photosynthesis',
    });
  }

  if (photosynthesisResult.co2Delta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'co2',
      delta: photosynthesisResult.co2Delta,
      source: 'photosynthesis',
    });
  }

  if (photosynthesisResult.nitrateDelta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'nitrate',
      delta: photosynthesisResult.nitrateDelta,
      source: 'photosynthesis',
    });
  }

  // 2. Calculate respiration (24/7)
  const respirationResult = calculateRespiration(
    totalPlantSize,
    state.resources.temperature,
    plantsConfig
  );

  // Add respiration effects
  if (respirationResult.oxygenDelta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'oxygen',
      delta: respirationResult.oxygenDelta,
      source: 'respiration',
    });
  }

  if (respirationResult.co2Delta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'co2',
      delta: respirationResult.co2Delta,
      source: 'respiration',
    });
  }

  // 3. Distribute biomass and handle growth
  const growthResult = distributeBiomass(
    state.plants,
    photosynthesisResult.biomassProduced,
    plantsConfig
  );

  // Add waste effect from extreme overgrowth
  if (growthResult.wasteReleased > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: growthResult.wasteReleased,
      source: 'plant-overgrowth',
    });
  }

  // Update plant sizes in state
  const newState = produce(state, (draft) => {
    draft.plants = growthResult.updatedPlants;
  });

  return { state: newState, effects };
}

// Re-export helper functions for testing and UI use
export {
  calculatePhotosynthesis,
  getTotalPlantSize,
  calculateCo2Factor,
  calculateNitrateFactor,
} from '../systems/photosynthesis.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  distributeBiomass,
  getMaxPlantSize,
  calculateOvergrowthPenalty,
  getSpeciesGrowthRate,
} from '../systems/plant-growth.js';
