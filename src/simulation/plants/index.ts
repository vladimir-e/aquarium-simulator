/**
 * Plants processing — full supply chain per plant per tick.
 *
 * Pipeline:
 * 1. The canopy: each plant's light at its own height, read by photosynthesis
 *    and vitality and handed back as the light the tick ran on.
 * 2. Each plant's draw on the water and the bed, read once: its Liebig
 *    sufficiency runs photosynthesis and vitality, and the draws request its
 *    tissue.
 * 3. Photosynthesis: O2 production and CO2 uptake only. Light-gated: zero
 *    output at night.
 * 4. Respiration: O2/CO2 effects, 24/7.
 * 5. Vitality per plant: the new condition and `Plant.surplus` bank —
 *    income at full condition banks, the bank heals condition below it.
 * 6. What each bank buys at full supply: a full bank's offshoot, then growth
 *    at `growthDrawRate` of what is left, day and night.
 * 7. The pools supply that tissue: each delivers on the planting's requests,
 *    and each plant gets the share of its purchase they allow.
 * 8. Shedding + death (lifecycle module) — low condition sheds tissue, and
 *    condition 0 removes the plant. Both return it as waste.
 * 9. Survivors age a tick; offshoots join the end of the list at age 0.
 *
 * Called during ACTIVE tier processing in tick.ts.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import { PLANT_SPECIES_DATA, growthFormOf } from './species.js';
import {
  canopyLight,
  getTotalRateUnits,
  lightAtHeight,
  type CanopyLight,
  type PlantLight,
} from './canopy.js';
import type { Effect } from '../core/effects.js';
import { NUTRIENTS, type Nutrient, type TunableConfig } from '../config/index.js';
import { calculatePhotosynthesis } from '../systems/photosynthesis.js';
import {
  drawTissue,
  ghDrawn,
  liebig,
  organicNutrients,
  plantShares,
  poolDraws,
  tankPools,
} from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { purchase, sizeBought, supply } from '../systems/plant-growth.js';
import { createOffshoot } from './create-plant.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import {
  calculateShedding,
  calculateDeathWaste,
  tissueMass,
} from '../systems/plant-lifecycle.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import { calculateTankHeight } from '../state.js';
import type { VitalityResult } from '../systems/vitality.js';

function canopyOf(state: SimulationState, config: TunableConfig): CanopyLight[] {
  return canopyLight(state.plants, state.tank.capacity, config.optics);
}

function lightOf(state: SimulationState, canopy: CanopyLight[]): PlantLight[] {
  const depth = calculateTankHeight(state.tank.capacity);
  return state.plants.map((plant, i) => lightAtHeight(plant, canopy[i], state.resources, depth));
}

/** Every plant's light, in `state.plants` order — the readings vitality runs on. */
export function readPlantLight(state: SimulationState, config: TunableConfig): PlantLight[] {
  return lightOf(state, canopyOf(state, config));
}

export interface PlantsProcessingResult {
  /** Updated state with modified plant sizes */
  state: SimulationState;
  /** Effects for resource changes (O2, CO2, nutrients, GH, waste); the bed's draw lands on the state */
  effects: Effect[];
  /** Each plant's vitality this tick, in the handed `state.plants` order. */
  vitalities: VitalityResult[];
  /** The light each plant stood in this tick, in the same order. */
  light: PlantLight[];
  /** Grams of waste shed this tick, apart from a death's one-off lump. */
  shedding: number;
}

/**
 * Process plants for one tick. See module-level docstring for the
 * pipeline shape.
 */
export function processPlants(
  state: SimulationState,
  config: TunableConfig
): PlantsProcessingResult {
  const effects: Effect[] = [];
  const plantsConfig = config.plants;
  const nutrientsConfig = config.nutrients;

  if (state.plants.length === 0) {
    return { state, effects, vitalities: [], light: [], shedding: 0 };
  }

  // 1. The canopy, and each plant's light in it.
  const light = lightOf(state, canopyOf(state, config));

  // 2. Where each plant feeds, once: vitality and the tissue draw both run on it.
  const pools = tankPools(state);
  const draws = state.plants.map((plant) => poolDraws(pools, plant.species, nutrientsConfig));
  const sufficiency = draws.map((draw) => liebig(plantShares(draw)));

  // 3. Photosynthesis: the gases only.
  const photosynthesisResult = calculatePhotosynthesis(
    state.plants,
    light.map((plant) => plant.par),
    state.resources.co2,
    state.resources.water,
    sufficiency,
    plantsConfig
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
      nutrientSufficiency: sufficiency[i],
      algaeMass,
      light: light[i],
    })
  );

  // 6. What each bank buys at full supply.
  const purchases = state.plants.map((start, i) =>
    purchase(
      { ...start, condition: vitalities[i].newCondition, surplus: vitalities[i].surplus },
      plantsConfig
    )
  );

  // 7. The water and the bed supply the tissue.
  const tissue = drawTissue(
    purchases.map((bought, i) => ({
      grams: tissueMass(bought.before.species, sizeBought(bought), plantsConfig),
      draws: draws[i],
    })),
    pools,
    organicNutrients(config.livestock, nutrientsConfig)
  );
  const [fromWater, fromBed] = tissue.drawn;
  for (const n of NUTRIENTS) pushDelta(n, -fromWater[n], 'plant-growth');
  pushDelta('gh', -ghDrawn(fromWater.nitrate + fromBed.nitrate, state.resources), 'plant-growth');

  // 8–9 run on the draft: an offshoot's id and vigour come off the tank's stream.
  let shedWaste = 0;
  let deathWaste = 0;
  const newState = produce(state, (draft) => {
    for (const n of NUTRIENTS) draft.equipment.substrate.nutrients[n] -= fromBed[n];

    const survivors: Plant[] = [];
    const offshoots: Plant[] = [];

    purchases.forEach((bought, i) => {
      const species = PLANT_SPECIES_DATA[bought.before.species];
      const { after, offshootSize } = supply(bought, tissue.supplied[i]);
      let plant = after;

      if (offshootSize > 0) {
        offshoots.push(createOffshoot(plant, offshootSize, draft.rng));
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

      // 8. Shedding and death.
      const { sizeReduction, wasteProduced } = calculateShedding(plant, plantsConfig);
      if (sizeReduction > 0) {
        plant = { ...plant, size: plant.size - sizeReduction };
        shedWaste += wasteProduced;
      }
      if (plant.condition <= 0) {
        deathWaste += calculateDeathWaste(plant, plantsConfig);
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

  if (shedWaste > 0) {
    effects.push({ tier: 'active', resource: 'waste', delta: shedWaste, source: 'plant-shedding' });
  }
  if (deathWaste > 0) {
    effects.push({ tier: 'active', resource: 'waste', delta: deathWaste, source: 'plant-death' });
  }

  return {
    state: newState,
    effects,
    vitalities,
    light,
    shedding: shedWaste,
  };
}

export {
  calculatePhotosynthesis,
  calculateCo2Factor,
} from '../systems/photosynthesis.js';
export {
  LEAF_AREA_PER_RATE_UNIT,
  plantHeight,
  leafArea,
  rateUnits,
  getTotalRateUnits,
  canopyLight,
  floorCover,
  floorShade,
  isOvergrown,
} from './canopy.js';
export type { CanopyLight, PlantLight } from './canopy.js';
export {
  calculateRespiration,
  getRespirationTemperatureFactor,
} from '../systems/respiration.js';
export {
  spendSurplus,
  propagate,
  getSpeciesGrowthRate,
} from '../systems/plant-growth.js';
export type { Propagation } from '../systems/plant-growth.js';
export { VIGOUR_SPAN, MIN_PLANTABLE_SIZE, isPlantableSize } from './create-plant.js';
export {
  calculateNutrientSufficiency,
  speciesDemand,
  speciesHalfSaturation,
  nutrientShare,
  nutrientShares,
  tankPools,
  poolDraws,
  plantShares,
  organicNutrients,
} from '../systems/nutrients.js';
export type { NutrientPool, TankPools, PoolDraw } from '../systems/nutrients.js';
export { tissueMass } from '../systems/plant-lifecycle.js';
export {
  computePlantVitality,
  buildPlantStressors,
  buildPlantBenefits,
  plantHealingRate,
  plantNitrateEdge,
} from '../systems/plant-vitality.js';
