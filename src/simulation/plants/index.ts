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
 * 4. Vitality per plant: drives condition update; emits per-tick
 *    surplus when condition is full and net is positive. Runs every
 *    tick — condition can heal at night from non-light benefits.
 * 5. Bank surplus on `Plant.surplus`. **Photoperiod-gated**: surplus
 *    represents stored photosynthate, so banking only happens when
 *    `resources.light > 0`. Vitality's surplus emission overnight is
 *    discarded (no photosynthesis = no energy capture).
 * 6. Spend surplus on growth: drains up to `plantGrowthPerTickCap`
 *    per tick, converts to size at species-rate × asymptotic-factor.
 *    Also photoperiod-gated — no carbon fixation overnight, no net
 *    biomass accumulation. Anything left in the bank stays for
 *    future propagation work.
 * 7. Shedding + death (lifecycle module) — applied last, can remove
 *    plants from the tank.
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
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { spendSurplusOnGrowth } from '../systems/plant-growth.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import {
  calculateShedding,
  calculateDeathWaste,
  shouldPlantDie,
} from '../systems/plant-lifecycle.js';
import { createLog } from '../core/logging.js';

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
  const plantsConfig = config.plants ?? plantsDefaults;
  const nutrientsConfig = config.nutrients ?? nutrientsDefaults;

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

  // 3. Vitality per plant: drives condition update and emits surplus.
  const vitalities = state.plants.map((plant) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig,
      nutrientSufficiency: sufficiencyByPlantId.get(plant.id) ?? 0,
    })
  );

  // 4. Apply condition update + bank surplus + spend on growth in one
  //    pass.
  //
  //    Plant surplus represents stored photosynthate (sugars from
  //    carbon fixation). Both banking and growth gate on the
  //    photoperiod being active: no light → no photosynthesis → no
  //    energy capture → no banking, and no withdrawals for new
  //    biomass either (overnight respiration consumes sugars for
  //    maintenance, not net growth). Condition healing is NOT gated
  //    here — vitality's non-light benefits (pH, temp, nutrients) can
  //    still drive recovery at night; only the surplus-accrual and
  //    surplus-spending steps require lights on.
  //
  //    Vitality runs every tick regardless; the light-keyed factors
  //    inside vitality (light stressor / light benefit / CO2 low
  //    stressor) already self-zero at light = 0, so condition tracks
  //    the real non-light environment overnight without needing a
  //    second gate here.
  const photoperiodActive = state.resources.light > 0;
  const mergedPlants: Plant[] = state.plants.map((plant, i) => {
    const v = vitalities[i];
    const updated: Plant = {
      ...plant,
      condition: v.newCondition,
      surplus: photoperiodActive ? plant.surplus + v.surplus : plant.surplus,
    };
    return photoperiodActive ? spendSurplusOnGrowth(updated, plantsConfig) : updated;
  });

  // 5. Shedding (low-condition plants lose biomass) and death.
  let totalConditionWaste = 0;
  const deadPlantNames: string[] = [];
  const processedPlants: Plant[] = [];

  for (const plant of mergedPlants) {
    // Shedding scales with how low condition is.
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
} from '../systems/photosynthesis.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  spendSurplusOnGrowth,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from '../systems/plant-growth.js';
export {
  calculateNutrientSufficiency,
  getDemandMultiplier,
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
} from '../systems/plant-vitality.js';
