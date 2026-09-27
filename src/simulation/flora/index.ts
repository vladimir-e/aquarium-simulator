/**
 * The flora pass — every plant and the bloom through one supply chain per
 * tick, so they fix carbon from one CO₂ stock and draw their tissue from one
 * pool in one call, neither served before the other.
 *
 * Pipeline:
 * 1. Light: each plant's at its own height in the canopy, the bloom's as the
 *    mean over the water column.
 * 2. Each feeder's draw on the water and the bed, read once: its Liebig
 *    sufficiency runs photosynthesis and vitality, and the draws request its
 *    tissue.
 * 3. Photosynthesis: O2 production and CO2 uptake only, zero at night.
 * 4. Respiration: O2/CO2 effects, 24/7.
 * 5. Vitality: each plant's and the bloom's new condition and bank — income
 *    at full condition banks, the bank heals condition below it.
 * 6. What each bank buys at full supply: a plant's offshoot, then its growth;
 *    the bloom's mass and the spores that land. Day and night.
 * 7. The pools supply that tissue: each form in each delivers on every
 *    request at one fraction — nitrogen from ammonia first, then nitrate for
 *    what ammonia left — and each feeder gets the share of its purchase they
 *    allow.
 * 8. Shedding and death — low condition sheds tissue, and condition 0 kills.
 *    Both return it as waste.
 * 9. Offshoots and spores join at condition 100 — offshoots at the end of the
 *    list at age 0, spores into the bloom by mass — and surviving plants age a
 *    tick.
 *
 * Plants read the bloom's mass and the bloom reads the planting as the hour
 * starts, so neither sees the other's hour until the next.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import { calculateTankHeight } from '../state.js';
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
  bloomFeeder,
  bloomFixer,
  bloomLight,
  bloomTissue,
  landSpores,
  loseBloom,
  massBought,
  purchaseBloom,
  supplyBloom,
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
} from '../systems/nutrients.js';
import { calculateRespiration } from '../systems/respiration.js';
import { purchase, sizeBought, supply } from '../systems/plant-growth.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import { losePlant, tissueMass } from '../systems/plant-lifecycle.js';
import type { VitalityResult } from '../systems/vitality.js';

/** The bloom's hour in the pass. */
export interface BloomHour {
  vitality: VitalityResult;
  light: BloomLight;
  /** Grams of waste shed, apart from a die-back's one-off lump. */
  shedding: number;
  /** Bank points its growth cost — nothing the hour it dies back. */
  spent: number;
  /** mg of each form its new tissue took from the water. */
  drawn: FormVector;
}

export interface FloraProcessingResult {
  state: SimulationState;
  /** Resource changes (O2, CO2, nutrients, GH, waste); the bed's draw lands on the state. */
  effects: Effect[];
  /** Each plant's vitality this tick, in the handed `state.plants` order. */
  vitalities: VitalityResult[];
  /** The light each plant stood in this tick, in the same order. */
  light: PlantLight[];
  /** Grams of waste the plants shed this tick, apart from a death's one-off lump. */
  shedding: number;
  /** mg of each form the plants' new tissue took from the water. */
  drawn: FormVector;
  algae: BloomHour;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const sumForms = (vectors: readonly FormVector[]): FormVector =>
  mapForms((f) => sum(vectors.map((vector) => vector[f])));

export function processFlora(state: SimulationState, config: TunableConfig): FloraProcessingResult {
  const effects: Effect[] = [];
  const { plants: plantsConfig, nutrients: nutrientsConfig } = config;
  const litres = state.tank.capacity;
  const waterVolume = state.resources.water;
  const bloom = state.algae;

  const pushDelta = (resource: NutrientForm | 'oxygen' | 'co2' | 'gh' | 'waste', delta: number, source: string): void => {
    if (delta !== 0) effects.push({ tier: 'active', resource, delta, source });
  };

  // 1. Light.
  const light = readPlantLight(state, config);
  const bloomLit = bloomLight(state.resources, calculateTankHeight(litres), config.optics, ALGAE);

  // 2. Where each feeder feeds, once.
  const pools = tankPools(state);
  const draws = state.plants.map((plant) => poolDraws(pools, plantFeeder(plant.species, nutrientsConfig)));
  const sufficiency = draws.map((draw) => liebig(feederShares(draw)));
  const bloomDraws = poolDraws(pools, bloomFeeder(ALGAE, nutrientsConfig));
  const bloomSufficiency = liebig(feederShares(bloomDraws));

  // 3. Photosynthesis: the gases only. Only the gases are stored as a
  //    concentration, so only they convert through the water volume.
  const fixers = [
    ...state.plants.map((plant, i) => plantFixer(plant, light[i].par, sufficiency[i], plantsConfig)),
    bloomFixer(bloom, litres, bloomLit, bloomSufficiency, ALGAE, plantsConfig),
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
  const vitalities = state.plants.map((plant, i) =>
    computePlantVitality({
      plant,
      resources: state.resources,
      waterVolume,
      plantsConfig,
      nutrientSufficiency: sufficiency[i],
      algaeMass: bloom.mass,
      light: light[i],
    })
  );
  const bloomVitality = computeAlgaeVitality({
    bloom,
    traits: ALGAE,
    resources: state.resources,
    plants: state.plants,
    litres,
    plantsConfig,
    algaeConfig: config.algae,
    nutrientSufficiency: bloomSufficiency,
    light: bloomLit,
  });

  // 6. What each bank buys at full supply.
  const purchases = state.plants.map((start, i) =>
    purchase({ ...start, condition: vitalities[i].newCondition, surplus: vitalities[i].surplus }, plantsConfig)
  );
  const bloomPurchase = purchaseBloom(
    { ...bloom, condition: bloomVitality.newCondition, surplus: bloomVitality.surplus },
    ALGAE,
    plantsConfig
  );

  // 7. The water and the bed supply the tissue, to everyone at once.
  const tissue = drawTissue(
    [
      ...purchases.map((bought, i) => ({
        grams: tissueMass(bought.before.species, sizeBought(bought), plantsConfig),
        draws: draws[i],
      })),
      { grams: bloomTissue(massBought(bloomPurchase), litres, ALGAE), draws: bloomDraws },
    ],
    pools,
    organicNutrients(config.livestock, nutrientsConfig)
  );
  const plantsDrew = sumForms(tissue.taken.slice(0, state.plants.length).map(([water]) => water));
  const [bloomDrew] = tissue.taken[state.plants.length];
  const fromWater = sumForms(tissue.taken.map(([water]) => water));
  const fromBed = sumForms(tissue.taken.map(([, bed]) => bed));
  for (const f of NUTRIENT_FORMS) pushDelta(f, -fromWater[f], 'growth');
  pushDelta('gh', -ghDrawn(nutrientsIn(fromWater).nitrate + nutrientsIn(fromBed).nitrate, state.resources), 'growth');
  const supplied = purchases.map((bought, i) => supply(bought, tissue.supplied[i]));
  const bloomSupplied = supplyBloom(bloomPurchase, tissue.supplied[state.plants.length], ALGAE, plantsConfig);

  // 8. Losses: low condition sheds, condition 0 kills, and both return the tissue as waste.
  const plantLosses = supplied.map(({ after }) => losePlant(after, plantsConfig));
  const bloomLoss = loseBloom(bloomSupplied.after, litres, ALGAE, plantsConfig);
  const plantShedding = sum(plantLosses.map((loss) => loss.shed));
  pushDelta('waste', plantShedding, 'plant-shedding');
  pushDelta('waste', sum(plantLosses.map((loss) => loss.died)), 'plant-death');
  pushDelta('waste', bloomLoss.shed, 'algae-shedding');
  pushDelta('waste', bloomLoss.died, 'algae-death');

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

    if (bloomLoss.survivor === null) {
      log('warning', measured`${ALGAE.name} died back from ${coverage(bloomSupplied.after.mass)} coverage`, 'algae-died');
    }
    draft.algae = landSpores(bloomLoss.survivor, bloomSupplied.spores);
  });

  return {
    state: newState,
    effects,
    vitalities,
    light,
    shedding: plantShedding,
    drawn: plantsDrew,
    algae: {
      vitality: bloomVitality,
      light: bloomLit,
      shedding: bloomLoss.shed,
      spent: bloomLoss.survivor === null ? 0 : bloomVitality.surplus - bloomSupplied.after.surplus,
      drawn: bloomDrew,
    },
  };
}
