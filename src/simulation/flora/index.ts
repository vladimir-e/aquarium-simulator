/**
 * The flora pass — every plant and every kind of bloom through one supply
 * chain per tick, so they fix carbon from one CO₂ stock and draw their tissue
 * from one pool in one call, none served before another.
 *
 * Pipeline:
 * 1. Light: each plant's at its own height in the canopy, each bloom's as the
 *    mean over its habitat.
 * 2. Each feeder's draw on the water and the bed, read once: its Liebig
 *    sufficiency runs photosynthesis and vitality, and the draws request its
 *    tissue.
 * 3. Photosynthesis: O2 production and CO2 uptake only, zero at night.
 * 4. Respiration: O2/CO2 effects, 24/7.
 * 5. Vitality: each plant's and each bloom's new condition and bank — income
 *    at full condition banks, the bank heals condition below it.
 * 6. What each bank buys at full supply: a plant's offshoot, then its growth;
 *    a bloom's mass and the spores that land. Day and night.
 * 7. The pools supply that tissue: each form in each delivers on every
 *    request at one fraction — nitrogen from ammonia first, then nitrate for
 *    what ammonia left — and each feeder gets the share of its purchase they
 *    allow. The uptake moves GH, and KH by the protons each form carries.
 * 8. Shedding and death — low condition sheds tissue, and condition 0 kills.
 *    Both return it as waste.
 * 9. Offshoots and spores join at condition 100 — offshoots at the end of the
 *    list at age 0, spores into their bloom by mass — and surviving plants age
 *    a tick.
 *
 * Plants read the blooms and the blooms read the planting as the hour starts,
 * so none sees another's hour until the next.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import type { Effect } from '../core/effects.js';
import { coverage, createLog, measured, type LogEvent, type LogSeverity, type LogText } from '../core/logging.js';
import { NUTRIENT_FORMS, NUTRIENTS, mapForms, type FormVector, type NutrientForm, type TunableConfig } from '../config/index.js';
import { getPpm } from '../resources/index.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import type { PlantLight } from '../plants/canopy.js';
import { readPlantLight } from '../plants/index.js';
import { createOffshoot } from '../plants/create-plant.js';
import {
  ALGAE,
  ALGAE_KINDS,
  bloomFeeder,
  bloomFixer,
  bloomLight,
  bloomTissue,
  combinedCoverage,
  habitatGain,
  habitatSize,
  landSpores,
  loseBloom,
  mapKinds,
  massBought,
  purchaseBloom,
  supplyBloom,
  type AlgaeKind,
  type BloomLight,
} from '../algae/index.js';
import { computeAlgaeVitality } from '../systems/algae-vitality.js';
import { calculatePhotosynthesis, plantFixer } from '../systems/photosynthesis.js';
import {
  drawTissue,
  feederShares,
  ghDrawn,
  liebig,
  nutrientsIn,
  organicNutrients,
  plantFeeder,
  poolDraws,
  tankPools,
  uptakeAlkalinity,
} from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { purchase, sizeBought, supply } from '../systems/plant-growth.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import { losePlant, tissueMass } from '../systems/plant-lifecycle.js';
import type { VitalityResult } from '../systems/vitality.js';

/** A bloom's hour in the pass. */
export interface BloomHour {
  vitality: VitalityResult;
  light: BloomLight;
  /** Grams of waste shed, apart from a die-back's one-off lump. */
  shedding: number;
  /** Bank points its growth cost — nothing the hour it dies back. */
  spent: number;
  /** mg of each form its new tissue took up from the water. */
  waterUptake: FormVector;
}

export interface FloraProcessingResult {
  state: SimulationState;
  /** Resource changes (O2, CO2, nutrients, GH, KH, waste); the bed's draw lands on the state. */
  effects: Effect[];
  /** Each plant's vitality this tick, in the handed `state.plants` order. */
  vitalities: VitalityResult[];
  /** The light each plant stood in this tick, in the same order. */
  light: PlantLight[];
  /** Grams of waste the plants shed this tick, apart from a death's one-off lump. */
  shedding: number;
  /** mg of each form the plants' new tissue took up from the water. */
  waterUptake: FormVector;
  algae: Record<AlgaeKind, BloomHour>;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const sumForms = (vectors: readonly FormVector[]): FormVector =>
  mapForms((f) => sum(vectors.map((vector) => vector[f])));

export function processFlora(state: SimulationState, config: TunableConfig): FloraProcessingResult {
  const effects: Effect[] = [];
  const { plants: plantsConfig, nutrients: nutrientsConfig } = config;
  const litres = state.tank.capacity;
  const waterVolume = state.resources.water;

  const pushDelta = (resource: NutrientForm | 'oxygen' | 'co2' | 'gh' | 'kh' | 'waste', delta: number, source: string): void => {
    if (delta !== 0) effects.push({ tier: 'active', resource, delta, source });
  };

  // 1–2. Light, and where each feeder feeds, once.
  const light = readPlantLight(state, config);
  const pools = tankPools(state);
  const draws = state.plants.map((plant) => poolDraws(pools, plantFeeder(plant.species, nutrientsConfig)));
  const sufficiency = draws.map((draw) => liebig(feederShares(draw)));
  const blooms = ALGAE_KINDS.map((kind) => {
    const traits = ALGAE[kind];
    const habitat = habitatSize(traits.habitat, state);
    const bloomDraws = poolDraws(pools, bloomFeeder(traits, nutrientsConfig));
    return {
      kind,
      traits,
      bloom: state.algae[kind],
      habitat,
      light: bloomLight(state.resources, habitatGain(traits.habitat, state, config.optics), traits),
      draws: bloomDraws,
      sufficiency: liebig(feederShares(bloomDraws)),
    };
  });

  // 3. Photosynthesis: the gases only. Only the gases are stored as a
  //    concentration, so only they convert through the water volume.
  const fixers = [
    ...state.plants.map((plant, i) => plantFixer(plant, light[i].par, sufficiency[i], plantsConfig)),
    ...blooms.map((b) => bloomFixer(b.bloom, b.habitat, b.light, b.sufficiency, b.traits, plantsConfig)),
  ];
  const photosynthesis = calculatePhotosynthesis(fixers, state.resources.co2, waterVolume, plantsConfig);
  pushDelta('oxygen', getPpm(photosynthesis.oxygenProducedMg, waterVolume), 'photosynthesis');
  pushDelta('co2', -getPpm(photosynthesis.co2ConsumedMg, waterVolume), 'photosynthesis');

  // 4. Respiration, on the rate units that fix.
  const respiration = calculateRespiration(
    sum(fixers.map((fixer) => fixer.metabolicRateUnits)),
    state.resources.temperature,
    state.resources.oxygen,
    plantsConfig
  );
  pushDelta('oxygen', -getPpm(respiration.oxygenConsumedMg, waterVolume), 'respiration');
  pushDelta('co2', getPpm(respiration.co2ProducedMg, waterVolume), 'respiration');

  // 5. Vitality.
  const algaeMass = combinedCoverage(state.algae);
  const vitalities = state.plants.map((plant, i) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume,
      plantsConfig,
      nutrientSufficiency: sufficiency[i],
      algaeMass,
      light: light[i],
    })
  );
  const bloomVitalities = blooms.map((b) =>
    computeAlgaeVitality({
      bloom: b.bloom,
      traits: b.traits,
      resources: state.resources,
      plants: state.plants,
      litres,
      plantsConfig,
      algaeConfig: config.algae,
      nutrientSufficiency: b.sufficiency,
      light: b.light,
    })
  );

  // 6. What each bank buys at full supply.
  const purchases = state.plants.map((start, i) =>
    purchase({ ...start, condition: vitalities[i].newCondition, surplus: vitalities[i].surplus }, plantsConfig)
  );
  const bloomPurchases = blooms.map((b, k) =>
    purchaseBloom(
      { ...b.bloom, condition: bloomVitalities[k].newCondition, surplus: bloomVitalities[k].surplus },
      b.traits,
      plantsConfig
    )
  );

  // 7. The water and the bed supply the tissue, to everyone at once.
  const tissue = drawTissue(
    [
      ...purchases.map((bought, i) => ({
        grams: tissueMass(bought.before.species, sizeBought(bought), plantsConfig),
        draws: draws[i],
      })),
      ...blooms.map((b, k) => ({ grams: bloomTissue(massBought(bloomPurchases[k]), b.habitat, b.traits), draws: b.draws })),
    ],
    pools,
    organicNutrients(config.livestock, nutrientsConfig)
  );
  const plantCount = state.plants.length;
  const plantUptake = sumForms(tissue.uptake.slice(0, plantCount).map(([water]) => water));
  const bloomUptakes = tissue.uptake.slice(plantCount).map(([water]) => water);
  const fromWater = sumForms([plantUptake, ...bloomUptakes]);
  const fromBed = sumForms(tissue.uptake.map(([, bed]) => bed));
  const uptake = sumForms([fromWater, fromBed]);
  for (const f of NUTRIENT_FORMS) pushDelta(f, -fromWater[f], 'growth');
  pushDelta('gh', -ghDrawn(nutrientsIn(uptake).nitrate, state.resources), 'growth');
  pushDelta('kh', uptakeAlkalinity(uptake), 'growth');
  const supplied = purchases.map((bought, i) => supply(bought, tissue.supplied[i]));
  const bloomsSupplied = blooms.map((b, k) =>
    supplyBloom(bloomPurchases[k], tissue.supplied[plantCount + k], b.traits, plantsConfig)
  );

  // 8. Losses: low condition sheds, condition 0 kills, and both return the tissue as waste.
  const plantLosses = supplied.map(({ after }) => losePlant(after, plantsConfig));
  const bloomLosses = blooms.map((b, k) => loseBloom(bloomsSupplied[k].after, b.habitat, b.traits, plantsConfig));
  const plantShedding = sum(plantLosses.map((loss) => loss.shed));
  pushDelta('waste', plantShedding, 'plant-shedding');
  pushDelta('waste', sum(plantLosses.map((loss) => loss.died)), 'plant-death');
  pushDelta('waste', sum(bloomLosses.map((loss) => loss.shed)), 'algae-shedding');
  pushDelta('waste', sum(bloomLosses.map((loss) => loss.died)), 'algae-death');

  // 9. Offshoots and spores join, the survivors age a tick. An offshoot's id and vigour come off the tank's stream.
  const newState = produce(state, (draft) => {
    for (const n of NUTRIENTS) draft.equipment.substrate.nutrients[n] -= fromBed[n];
    const log = (severity: LogSeverity, text: string | LogText, event: LogEvent): void => {
      draft.logs.push(createLog(draft.tick, 'simulation', severity, text, event));
    };

    const survivors: Plant[] = [];
    const offshoots: Plant[] = [];
    supplied.forEach(({ after, offshootSize }, i) => {
      const species = PLANT_SPECIES_DATA[after.species];
      if (offshootSize > 0) {
        offshoots.push(createOffshoot(after, offshootSize, draft.rng));
        log('info', `${species.name} ${growthFormOf(after.species).offshootVerb}`, 'plant-propagated');
      }
      const { survivor } = plantLosses[i];
      if (survivor === null) log('warning', `${species.name} died from poor conditions`, 'plant-died');
      else survivors.push({ ...survivor, age: survivor.age + 1 });
    });
    draft.plants = [...survivors, ...offshoots];

    blooms.forEach(({ kind, traits }, k) => {
      const { survivor } = bloomLosses[k];
      if (survivor === null) {
        log('warning', measured`${traits.name} died back from ${coverage(bloomsSupplied[k].after.mass)} coverage`, 'algae-died');
      }
      draft.algae[kind] = landSpores(survivor, bloomsSupplied[k].spores);
    });
  });

  return {
    state: newState,
    effects,
    vitalities,
    light,
    shedding: plantShedding,
    waterUptake: plantUptake,
    algae: mapKinds((_, k) => ({
      vitality: bloomVitalities[k],
      light: blooms[k].light,
      shedding: bloomLosses[k].shed,
      spent: bloomLosses[k].survivor === null ? 0 : bloomVitalities[k].surplus - bloomsSupplied[k].after.surplus,
      waterUptake: bloomUptakes[k],
    })),
  };
}
