/**
 * Plants processing - handles photosynthesis, respiration, growth, and nutrients.
 *
 * Per-plant condition is driven by the unified vitality engine: each
 * plant gets a damage/benefit breakdown across light, CO2, temperature,
 * pH, nutrients (sufficiency + toxicity), and algae shading. Condition
 * heals only while net is positive; biomass growth fires only once
 * condition reaches 100 and surplus is captured — stressed plants heal
 * first, never crawl forward at reduced rate.
 *
 * Called during ACTIVE tier processing in tick.ts.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import {
  calculatePhotosynthesis,
  getTotalPlantSize,
} from '../systems/photosynthesis.js';
import { calculateRespiration } from '../systems/respiration.js';
import { distributeBiomass } from '../systems/plant-growth.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import { calculateShedding, calculateDeathWaste, shouldPlantDie } from '../systems/nutrients.js';
import { createLog } from '../core/logging.js';

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
 * 4. Nutrient sufficiency: check nutrient levels for each plant
 * 5. Condition updates: improve or degrade based on sufficiency
 * 6. Shedding and death: handle declining plants
 * 7. Nutrient consumption: plants consume nutrients proportionally
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
  const nutrientsConfig = config.nutrients ?? nutrientsDefaults;

  // Get total plant size
  const totalPlantSize = getTotalPlantSize(state.plants);

  // Skip if no plants
  if (state.plants.length === 0 || totalPlantSize === 0) {
    return { state, effects };
  }

  // 1. Calculate photosynthesis (only when light > 0)
  // Photosynthesis now owns nutrient uptake for all four plant macronutrients;
  // uptake scales with potential rate (light/CO2/size), biomass scales with
  // actual rate (post-Liebig). See systems/photosynthesis.ts for details.
  const photosynthesisResult = calculatePhotosynthesis(
    state.plants,
    state.resources.light,
    state.resources.co2,
    state.resources,
    state.resources.water,
    plantsConfig,
    nutrientsConfig
  );

  const pushDelta = (
    resource: 'oxygen' | 'co2' | 'nitrate' | 'phosphate' | 'potassium' | 'iron',
    delta: number,
    source: string
  ): void => {
    if (delta !== 0) {
      effects.push({ tier: 'active', resource, delta, source });
    }
  };

  pushDelta('oxygen', photosynthesisResult.oxygenDelta, 'photosynthesis');
  pushDelta('co2', photosynthesisResult.co2Delta, 'photosynthesis');
  pushDelta('nitrate', photosynthesisResult.nitrateDelta, 'photosynthesis');
  pushDelta('phosphate', photosynthesisResult.phosphateDelta, 'photosynthesis');
  pushDelta('potassium', photosynthesisResult.potassiumDelta, 'photosynthesis');
  pushDelta('iron', photosynthesisResult.ironDelta, 'photosynthesis');

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

  // 3. Compute vitality for each plant (drives condition + surplus).
  //    Surplus > 0 only when condition === 100 — that's the gate for
  //    biomass distribution below.
  const vitalities = state.plants.map((plant) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig,
      nutrientsConfig,
    })
  );

  // 4. Apply condition updates. Surplus is captured but not stored on
  //    Plant (yet — future tasks may want it on state). For now we use
  //    it inline as the per-plant growth multiplier.
  const conditionUpdated: Plant[] = state.plants.map((plant, i) => ({
    ...plant,
    condition: vitalities[i].newCondition,
  }));

  // 5. Distribute biomass — only to plants with surplus > 0. Plants
  //    below 100 % condition get zero share this tick (they're paying
  //    down the deficit before producing new tissue).
  //
  //    The biomass attributable to a stressed plant flows to its
  //    healthier neighbours via the rebalanced share computation
  //    inside `distributeBiomass`. This matches "photosynthesis still
  //    runs, but actual biomass is surplus-gated" from the spec — the
  //    unhealthy plant's photosynthate is treated as maintenance.
  const eligibleForGrowth = conditionUpdated.filter(
    (_, i) => vitalities[i].surplus > 0
  );
  const growthResult = distributeBiomass(
    eligibleForGrowth,
    photosynthesisResult.biomassProduced,
    plantsConfig
  );

  // Merge grown plants back with surplus-skipped (size unchanged).
  const grownById = new Map(growthResult.updatedPlants.map((p) => [p.id, p]));
  const mergedPlants: Plant[] = conditionUpdated.map(
    (plant) => grownById.get(plant.id) ?? plant
  );

  // Waste from extreme overgrowth (>200 % size) — only fires under
  // pathological inputs since the asymptotic growth factor self-limits.
  if (growthResult.wasteReleased > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: growthResult.wasteReleased,
      source: 'plant-overgrowth',
    });
  }

  // 6. Shedding (low-condition plants lose biomass) and death.
  let totalConditionWaste = 0;
  const deadPlantNames: string[] = [];
  const processedPlants: Plant[] = [];

  for (const plant of mergedPlants) {
    // Shedding scales with how low condition is (existing math, untouched).
    const { sizeReduction, wasteProduced } = calculateShedding(plant, nutrientsConfig);
    let updated: Plant = plant;
    if (sizeReduction > 0) {
      updated = { ...plant, size: Math.max(0, plant.size - sizeReduction) };
      totalConditionWaste += wasteProduced;
    }
    if (shouldPlantDie(updated, nutrientsConfig)) {
      totalConditionWaste += calculateDeathWaste(updated, nutrientsConfig);
      deadPlantNames.push(PLANT_SPECIES_DATA[plant.species].name);
      // Drop — surviving array doesn't include dead plants.
      continue;
    }
    processedPlants.push(updated);
  }

  if (totalConditionWaste > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: totalConditionWaste,
      source: 'plant-condition',
    });
  }

  // Nutrient consumption is handled inside calculatePhotosynthesis (step 1).
  const newState = produce(state, (draft) => {
    draft.plants = processedPlants;

    for (const plantName of deadPlantNames) {
      draft.logs.push(
        createLog(
          draft.tick,
          'simulation',
          'warning',
          `${plantName} died from poor conditions`
        )
      );
    }
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
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from '../systems/plant-growth.js';
export {
  calculateNutrientSufficiency,
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
  getDemandMultiplier,
} from '../systems/nutrients.js';
export {
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
} from '../systems/plant-vitality.js';
