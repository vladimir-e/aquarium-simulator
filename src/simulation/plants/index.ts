/**
 * Plants processing — full supply chain per plant per tick.
 *
 * Pipeline:
 * 1. Compute per-plant Liebig sufficiency once (shared by photosynthesis
 *    and vitality below).
 * 2. Photosynthesis: emits resource effects only — O2 production, CO2
 *    uptake, nutrient draw. Does NOT directly produce size growth;
 *    that flows through surplus. Light-gated: zero output at night.
 * 3. Respiration: O2/CO2 effects, 24/7.
 * 4. Vitality per plant: the new condition and `Plant.surplus` bank —
 *    income at full condition banks, the bank heals condition below it.
 * 5. Growth: the bank buys size at `growthDrawRate` of itself, day and night.
 * 6. Shedding + death (lifecycle module) — low condition sheds tissue, and
 *    condition 0 or too little size left removes the plant.
 *
 * Called during ACTIVE tier processing in tick.ts.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import { PLANT_SPECIES_DATA } from './species.js';
import type { Effect } from '../core/effects.js';
import type { Nutrient, TunableConfig } from '../config/index.js';
import {
  calculatePhotosynthesis,
  getTotalPlantSize,
} from '../systems/photosynthesis.js';
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { spendSurplus } from '../systems/plant-growth.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import {
  calculateShedding,
  calculateDeathWaste,
  shouldPlantDie,
} from '../systems/plant-lifecycle.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import type { VitalityResult } from '../systems/vitality.js';

/**
 * What every plant in the tank is doing this hour, in `state.plants`
 * order. `processPlants` runs the same numbers inside the tick off a
 * sufficiency map it shares with photosynthesis; this is the reader for
 * everything outside it — plant cards, the waste readout, probes.
 */
export function readPlantVitality(
  state: SimulationState,
  config: TunableConfig
): VitalityResult[] {
  return state.plants.map((plant) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig: config.plants,
      nutrientSufficiency: calculateNutrientSufficiency(
        state.resources,
        state.resources.water,
        plant.species,
        config.nutrients
      ),
      algaeMass: state.algae.mass,
    })
  );
}

export interface PlantsProcessingResult {
  /** Updated state with modified plant sizes */
  state: SimulationState;
  /** Effects for resource changes (O2, CO2, nitrate, waste) */
  effects: Effect[];
}

/**
 * Process plants for one tick. See module-level docstring for the
 * pipeline shape.
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
  const plantsConfig = config.plants;
  const nutrientsConfig = config.nutrients;

  // Get total plant size
  const totalPlantSize = getTotalPlantSize(state.plants);

  // Skip if no plants
  if (state.plants.length === 0 || totalPlantSize === 0) {
    return { state, effects };
  }

  // Compute Liebig nutrient sufficiency once per plant per tick. Both
  // photosynthesis (Liebig-gates biomass and uptake) and vitality
  // (drives the nutrient stressor + benefit pair) read this value;
  // computing it once keeps them consistent and avoids the triple
  // recomputation an earlier pass had.
  const sufficiencyByPlantId = new Map<string, number>(
    state.plants.map((plant) => [
      plant.id,
      calculateNutrientSufficiency(
        state.resources,
        state.resources.water,
        plant.species,
        nutrientsConfig
      ),
    ])
  );

  // 1. Photosynthesis: resource effects only (O2 release, CO2 uptake,
  //    nutrient draw). Plant size growth flows through the surplus
  //    supply chain below — photosynthesis does not directly add size.
  const photosynthesisResult = calculatePhotosynthesis(
    state.plants,
    state.resources.light,
    state.resources.co2,
    state.resources,
    state.resources.water,
    sufficiencyByPlantId,
    plantsConfig,
    nutrientsConfig
  );

  const pushDelta = (
    resource: Nutrient | 'oxygen' | 'co2' | 'gh',
    delta: number,
    source: string
  ): void => {
    if (delta !== 0) {
      effects.push({ tier: 'active', resource, delta, source });
    }
  };

  // Every draw below is a mass, but only the gases are *stored* as a
  // concentration, so only they convert through the water volume.
  const waterVolume = state.resources.water;

  pushDelta('oxygen', getPpm(photosynthesisResult.oxygenProducedMg, waterVolume), 'photosynthesis');
  pushDelta('co2', -getPpm(photosynthesisResult.co2ConsumedMg, waterVolume), 'photosynthesis');
  pushDelta('nitrate', photosynthesisResult.nitrateDelta, 'photosynthesis');
  pushDelta('phosphate', photosynthesisResult.phosphateDelta, 'photosynthesis');
  pushDelta('potassium', photosynthesisResult.potassiumDelta, 'photosynthesis');
  pushDelta('iron', photosynthesisResult.ironDelta, 'photosynthesis');
  pushDelta('gh', photosynthesisResult.ghDelta, 'photosynthesis');

  // 2. Calculate respiration (24/7)
  const respirationResult = calculateRespiration(
    totalPlantSize,
    state.resources.temperature,
    state.resources.oxygen,
    plantsConfig
  );

  pushDelta('oxygen', -getPpm(respirationResult.oxygenConsumedMg, waterVolume), 'respiration');
  pushDelta('co2', getPpm(respirationResult.co2ProducedMg, waterVolume), 'respiration');

  // 3. Vitality per plant: drives condition update and returns the new
  //    surplus bank. Algae mass comes from the prior tick's `state.algae.mass`
  //    (algae processing runs *after* plants in `tick.ts` so plant
  //    suppression / weakness factors read fresh plant condition).
  //    For algae's effect on plants this means a one-tick lag — a
  //    bloom that grows this tick won't shade plants until next
  //    tick. That's an acceptable trade-off for the algae-after-
  //    plants ordering required by the bigger-picture suppression
  //    feedback loop.
  const algaeMass = state.algae.mass;
  const vitalities = state.plants.map((plant) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig,
      nutrientSufficiency: sufficiencyByPlantId.get(plant.id) ?? 0,
      algaeMass,
    })
  );

  // 4. Apply the new condition and bank, then let the bank buy size.
  const mergedPlants: Plant[] = state.plants.map((plant, i) =>
    spendSurplus(
      { ...plant, condition: vitalities[i].newCondition, surplus: vitalities[i].surplus },
      plantsConfig
    )
  );

  // 5. Shedding and death.
  let totalConditionWaste = 0;
  const deadPlantNames: string[] = [];
  const processedPlants: Plant[] = [];

  for (const plant of mergedPlants) {
    const { sizeReduction, wasteProduced } = calculateShedding(plant, plantsConfig);
    let updated: Plant = plant;
    if (sizeReduction > 0) {
      updated = { ...plant, size: Math.max(0, plant.size - sizeReduction) };
      totalConditionWaste += wasteProduced;
    }
    if (shouldPlantDie(updated, plantsConfig)) {
      totalConditionWaste += calculateDeathWaste(updated, plantsConfig);
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
          `${plantName} died from poor conditions`,
          'plant-died'
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
} from '../systems/photosynthesis.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  spendSurplus,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from '../systems/plant-growth.js';
export {
  calculateNutrientSufficiency,
  speciesDemand,
  speciesHalfSaturation,
  nutrientShare,
} from '../systems/nutrients.js';
export {
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
} from '../systems/plant-lifecycle.js';
export {
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
  plantHealingRate,
} from '../systems/plant-vitality.js';
