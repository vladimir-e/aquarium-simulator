/**
 * Plants processing — full supply chain per plant per tick.
 *
 * Pipeline:
 * 1. The canopy: each plant's light at its own height, read by photosynthesis
 *    and vitality.
 * 2. Compute per-plant Liebig sufficiency once (shared by photosynthesis
 *    and vitality below).
 * 3. Photosynthesis: emits resource effects only — O2 production, CO2
 *    uptake, nutrient draw. Does NOT directly produce size growth;
 *    that flows through surplus. Light-gated: zero output at night.
 * 4. Respiration: O2/CO2 effects, 24/7.
 * 5. Vitality per plant: the new condition and `Plant.surplus` bank —
 *    income at full condition banks, the bank heals condition below it.
 * 6. Offshoot: a full bank buys a new unit of the family and resets, the
 *    fish spawn rule, before growth can draw on it.
 * 7. Growth: the bank buys size at `growthDrawRate` of itself, day and night.
 * 8. Shedding + death (lifecycle module) — low condition sheds tissue, and
 *    condition 0 or too little size left removes the plant.
 * 9. Survivors age a tick; offshoots join the end of the list at age 0.
 *
 * Called during ACTIVE tier processing in tick.ts.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import { PLANT_SPECIES_DATA, dailyLightEdge, growthFormOf } from './species.js';
import { canopyLight, getTotalRateUnits, plantHeight, type CanopyLight } from './canopy.js';
import type { Effect } from '../core/effects.js';
import type { Nutrient, TunableConfig } from '../config/index.js';
import { calculatePhotosynthesis } from '../systems/photosynthesis.js';
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { propagate, spendSurplus } from '../systems/plant-growth.js';
import { createOffshoot } from './create-plant.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import {
  calculateShedding,
  calculateDeathWaste,
  shouldPlantDie,
} from '../systems/plant-lifecycle.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import { calculateTankHeight } from '../state.js';
import { dailyLightIntegral } from '../equipment/light.js';
import type { VitalityResult } from '../systems/vitality.js';

function canopyOf(state: SimulationState, config: TunableConfig): CanopyLight[] {
  return canopyLight(state.plants, state.tank.capacity, config.optics);
}

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
  const canopy = canopyOf(state, config);
  return state.plants.map((plant, i) =>
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
      canopy: canopy[i],
    })
  );
}

/** The light one plant stands in, at its own height. */
export interface PlantLight {
  /** PAR at its mean leaf, µmol/m²/s. */
  par: number;
  /** PAR at the top of its crown, what the light-high stressor reads. */
  crownPar: number;
  /** The day's light at its mean leaf, mol/m²/d. */
  dailyLight: number;
  /** That day's light over the daily light the species starves under. */
  needShare: number;
  heightCm: number;
}

/** Every plant's light, in `state.plants` order — the readings vitality runs on. */
export function readPlantLight(state: SimulationState, config: TunableConfig): PlantLight[] {
  const canopy = canopyOf(state, config);
  const depth = calculateTankHeight(state.tank.capacity);
  const substrateDay = dailyLightIntegral(state.resources.lightByHour);
  return state.plants.map((plant, i) => {
    const dailyLight = substrateDay * canopy[i].leaf;
    return {
      par: state.resources.light * canopy[i].leaf,
      crownPar: state.resources.light * canopy[i].top,
      dailyLight,
      needShare: dailyLight / dailyLightEdge(plant.species),
      heightCm: plantHeight(plant, depth),
    };
  });
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

  if (state.plants.length === 0) {
    return { state, effects };
  }

  // 1. The canopy.
  const canopy = canopyOf(state, config);

  // 2. Liebig sufficiency, once per plant: photosynthesis gates biomass and
  //    uptake on it, and vitality its nutrient stressor and benefit.
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

  // 3. Photosynthesis: resource effects only (O2 release, CO2 uptake,
  //    nutrient draw). Plant size growth flows through the surplus
  //    supply chain below — photosynthesis does not directly add size.
  const photosynthesisResult = calculatePhotosynthesis(
    state.plants,
    canopy.map((light) => state.resources.light * light.leaf),
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

  // 4. Calculate respiration (24/7)
  const respirationResult = calculateRespiration(
    getTotalRateUnits(state.plants),
    state.resources.temperature,
    state.resources.oxygen,
    plantsConfig
  );

  pushDelta('oxygen', -getPpm(respirationResult.oxygenConsumedMg, waterVolume), 'respiration');
  pushDelta('co2', getPpm(respirationResult.co2ProducedMg, waterVolume), 'respiration');

  // 5. Vitality per plant: drives condition update and returns the new
  //    surplus bank. Algae mass comes from the prior tick's `state.algae.mass`
  //    (algae processing runs *after* plants in `tick.ts` so plant
  //    suppression / weakness factors read fresh plant condition).
  //    For algae's effect on plants this means a one-tick lag — a
  //    bloom that grows this tick won't shade plants until next
  //    tick. That's an acceptable trade-off for the algae-after-
  //    plants ordering required by the bigger-picture suppression
  //    feedback loop.
  const algaeMass = state.algae.mass;
  const vitalities = state.plants.map((plant, i) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume: state.resources.water,
      plantsConfig,
      nutrientSufficiency: sufficiencyByPlantId.get(plant.id) ?? 0,
      algaeMass,
      canopy: canopy[i],
    })
  );

  // 6–9 run on the draft: an offshoot's id and vigour come off the tank's stream.
  let totalConditionWaste = 0;
  const newState = produce(state, (draft) => {
    const survivors: Plant[] = [];
    const offshoots: Plant[] = [];

    state.plants.forEach((start, i) => {
      const species = PLANT_SPECIES_DATA[start.species];
      let plant: Plant = {
        ...start,
        condition: vitalities[i].newCondition,
        surplus: vitalities[i].surplus,
      };

      // 6. A full bank buys an offshoot, before growth can draw on it.
      const propagation = propagate(plant, plantsConfig);
      if (propagation) {
        plant = propagation.parent;
        offshoots.push(createOffshoot(plant, propagation.offshootSize, draft.rng));
        draft.logs.push(
          createLog(
            draft.tick,
            'simulation',
            'info',
            `${species.name} ${growthFormOf(plant.species).offshootVerb}`,
            'plant-propagated'
          )
        );
      }

      // 7. The bank buys size.
      plant = spendSurplus(plant, plantsConfig);

      // 8. Shedding and death.
      const { sizeReduction, wasteProduced } = calculateShedding(plant, plantsConfig);
      if (sizeReduction > 0) {
        plant = { ...plant, size: Math.max(0, plant.size - sizeReduction) };
        totalConditionWaste += wasteProduced;
      }
      if (shouldPlantDie(plant, plantsConfig)) {
        totalConditionWaste += calculateDeathWaste(plant, plantsConfig);
        draft.logs.push(
          createLog(
            draft.tick,
            'simulation',
            'warning',
            `${species.name} died from poor conditions`,
            'plant-died'
          )
        );
        return;
      }

      // 9. Survivors age; offshoots join at age 0 and act from the next tick.
      survivors.push({ ...plant, age: plant.age + 1 });
    });

    draft.plants = [...survivors, ...offshoots];
  });

  if (totalConditionWaste > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: totalConditionWaste,
      source: 'plant-condition',
    });
  }

  return { state: newState, effects };
}

// Re-export helper functions for testing and UI use
export {
  calculatePhotosynthesis,
  calculateCo2Factor,
} from '../systems/photosynthesis.js';
export {
  LEAF_AREA_PER_RATE_UNIT,
  plantHeight,
  leafArea,
  rateUnits,
  fullRateUnits,
  getTotalRateUnits,
  canopyLight,
  floorCover,
  floorShade,
  isOvergrown,
} from './canopy.js';
export type { CanopyLight } from './canopy.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  spendSurplus,
  propagate,
  getSpeciesGrowthRate,
  growthTaper,
} from '../systems/plant-growth.js';
export type { Propagation } from '../systems/plant-growth.js';
export { VIGOUR_SPAN } from './create-plant.js';
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
