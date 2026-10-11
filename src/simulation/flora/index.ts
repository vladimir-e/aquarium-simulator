/**
 * The flora pass — every plant and every kind of bloom through one hour of its
 * budget, on one law, so they fix carbon from one CO₂ stock and fill their
 * stores from the pools in one call, none served before another.
 *
 * The hour:
 * 1. Light: each plant's at its own height in the canopy, each bloom's as the
 *    mean over its habitat, all through the water and the blooms in it.
 * 2. Uptake: each one's stores ask for what they lack, and a bloom's spores for
 *    their structure at Q_min. The water and the bed deliver on every request
 *    at one fraction — nitrogen from ammonia first, then nitrate for what
 *    ammonia left — and the stores take it up; the spores take up only what
 *    they build and can store. The uptake moves GH, and KH by the protons each
 *    form carries.
 * 3. Photosynthate: light, carbon and oxygen set what each is offered, all
 *    drawn on the one CO₂ stock — a bloom's up to the ceiling thriving plants'
 *    exudates leave it.
 * 4. The budget: each runs its hour on what it was offered, asking its
 *    reserve to repair its deficit. What it assimilates draws CO₂ and releases
 *    O₂; what it burns does the reverse.
 * 5. Condition: one vitality step for every organism.
 * 6. Shedding and death: low condition sheds structure as waste, and condition
 *    0 kills — its remains are waste and its stores leach to the water, KH
 *    moving back by the charge their uptake moved. A bloom's die-back is logged
 *    where there was any of it to see.
 * 7. Offshoots and spores: a buffer that holds a new unit cuts it loose, and
 *    the spores land into their bloom.
 * 8. Offshoots join at the end of the list at age 0, and surviving plants age
 *    a tick.
 *
 * Plants read the blooms and the blooms read the planting as the hour starts,
 * so none sees another's hour until the next.
 */

import { produce } from 'immer';
import type { SimulationState, Plant } from '../state.js';
import type { Effect } from '../core/effects.js';
import { coverage, createLog, measured, type LogEvent, type LogSeverity, type LogText } from '../core/logging.js';
import {
  mapForms,
  mapNutrients,
  NUTRIENT_FORMS,
  NUTRIENTS,
  type FormVector,
  type NutrientForm,
  type TunableConfig,
} from '../config/index.js';
import { getPpm } from '../resources/index.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import type { PlantLight } from '../plants/canopy.js';
import { sizeOf } from '../plants/canopy.js';
import { readPlantLight } from '../plants/index.js';
import { createOffshoot, offshootStructure } from '../plants/create-plant.js';
import {
  ALGAE,
  ALGAE_KINDS,
  allelopathy,
  bloomFeeder,
  bloomFixer,
  bloomLight,
  bloomTissue,
  habitatGain,
  habitatSize,
  landSpores,
  mapKinds,
  massOf,
  sporesBuilt,
  sporesUptake,
  type AlgaeKind,
  type BloomLight,
} from '../algae/index.js';
import { BLOOM_VISIBLE_LINE } from '../alerts/bloom.js';
import { computeAlgaeVitality } from '../systems/algae-vitality.js';
import { carbonGases, offerCarbon, photosynthateOf, plantFixer } from '../systems/photosynthesis.js';
import {
  drawNutrients,
  ghDrawn,
  leach,
  nutrientsIn,
  plantFeeder,
  poolDraws,
  tankPools,
  uptakeAlkalinity,
} from '../systems/nutrients.js';
import { getRespirationTemperatureFactor } from '../systems/respiration.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import { buyOffshoot, stepFlora, storeRequest, takeUp, type FloraFluxes } from '../systems/flora-budget.js';
import { growthTaper, loseFlora } from '../systems/flora.js';
import { NO_STRESS, oxygenPace, repairAsked, totalBurned } from '../systems/reserve.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import type { VitalityResult } from '../systems/vitality.js';
import { sum } from '../core/sum.js';
import { addOrganics, type Organics } from '../core/organics.js';
import { bloomParams, plantParams } from './params.js';

/** A bloom's hour in the pass. */
export interface BloomHour {
  vitality: VitalityResult;
  light: BloomLight;
  /** What its budget did over the hour. */
  fluxes: FloraFluxes;
  /** Waste shed, apart from a die-back's one-off lump. */
  shedding: Organics;
  /** mg of each form its stores and its spores took up from the water. */
  waterUptake: FormVector;
  /** g of structure its spores landed. */
  spores: number;
  /** Share of its assimilation ceiling the planting's exudates left it, 0–1. */
  exudates: number;
}

export interface FloraProcessingResult {
  state: SimulationState;
  /** Resource changes (O2, CO2, nutrients, GH, KH, waste); the bed's draw lands on the state. */
  effects: Effect[];
  /** Each plant's vitality this tick, in the handed `state.plants` order. */
  vitalities: VitalityResult[];
  /** The light each plant stood in this tick, in the same order. */
  light: PlantLight[];
  /** What each plant's budget did over the hour, in the same order. */
  fluxes: FloraFluxes[];
  /** Waste the plants shed this tick, apart from a death's one-off lump. */
  shedding: Organics;
  /** mg of each form the plants' stores took up from the water. */
  waterUptake: FormVector;
  algae: Record<AlgaeKind, BloomHour>;
}

const sumForms = (vectors: readonly FormVector[]): FormVector =>
  mapForms((f) => sum(vectors.map((vector) => vector[f])));

export function processFlora(state: SimulationState, config: TunableConfig): FloraProcessingResult {
  const effects: Effect[] = [];
  const { plants: plantsConfig, nutrients: nutrientsConfig } = config;
  const { resources } = state;
  const waterVolume = resources.water;

  const pushDelta = (resource: NutrientForm | 'oxygen' | 'co2' | 'gh' | 'kh', delta: number, source: string): void => {
    if (delta !== 0) effects.push({ tier: 'active', resource, delta, source });
  };
  const pushWaste = (waste: Organics, source: string): void => {
    if (waste.grams !== 0) effects.push({ tier: 'active', resource: 'waste', delta: waste, source });
  };

  // 1. Light, the hour's pace, and where each one feeds.
  const light = readPlantLight(state, config);
  const tau = getRespirationTemperatureFactor(resources.temperature, plantsConfig);
  const saturation = calculateO2Saturation(resources.temperature, config.gasExchange);
  const omega = oxygenPace(resources.oxygen, saturation, plantsConfig.oxygenHalfSaturation);
  const pools = tankPools(state);
  const exudates = allelopathy(state.plants, waterVolume, config.algae);
  const plants = state.plants.map((plant, i) => ({
    budget: plant.budget,
    condition: plant.condition,
    p: plantParams(plant.species, plantsConfig, plant.vigour),
    draws: poolDraws(pools, plantFeeder(plant.species, nutrientsConfig)),
    room: growthTaper(sizeOf(plant)),
    fixer: plantFixer(plant, light[i].par, omega, plantsConfig),
    stress: NO_STRESS,
  }));
  const blooms = ALGAE_KINDS.map((kind) => {
    const traits = ALGAE[kind];
    const { budget, condition } = state.algae[kind];
    const habitat = habitatSize(traits.habitat, state);
    const lit = bloomLight(resources, habitatGain(traits.habitat, state, config.optics), traits);
    const room = growthTaper(massOf(budget.structure, habitat, traits));
    return {
      kind,
      traits,
      budget,
      condition,
      habitat,
      light: lit,
      p: bloomParams(kind, plantsConfig),
      draws: poolDraws(pools, bloomFeeder(traits, nutrientsConfig)),
      room,
      spores: bloomTissue(traits.sporeRate * room, habitat, traits),
      fixer: bloomFixer(state.algae[kind], lit, omega, exudates, traits, plantsConfig),
      stress: exudates,
    };
  });
  const flora = [...plants, ...blooms];
  const plantCount = plants.length;
  const kinds = blooms.length;

  // 2. The water and the bed fill every store, and build the spores, at once.
  const delivery = drawNutrients(
    [
      ...flora.map(({ budget, p, draws }) => ({ asked: storeRequest(budget, p, tau), draws })),
      ...blooms.map(({ p, draws, spores }) => ({ asked: mapNutrients((n) => p.qMin[n] * spores), draws })),
    ],
    pools
  );
  const sporesFrom = plantCount + kinds;
  const spores = blooms.map(({ spores, p }, k) => sporesBuilt(spores, delivery.delivered[sporesFrom + k], p));
  const taken = delivery.uptake.map((byPool, i) => {
    if (i < sporesFrom) return byPool;
    const k = i - sporesFrom;
    return byPool.map((forms) => sporesUptake(forms, delivery.delivered[i], spores[k], blooms[k].p));
  });
  const fromWater = taken.map(([water]) => water);
  const plantUptake = sumForms(fromWater.slice(0, plantCount));
  const bloomUptakes = blooms.map((_, k) => sumForms([fromWater[plantCount + k], fromWater[sporesFrom + k]]));
  const fromBed = sumForms(taken.map(([, bed]) => bed));
  const uptake = sumForms([...fromWater, fromBed]);
  for (const f of NUTRIENT_FORMS) pushDelta(f, -sumForms(fromWater)[f], 'uptake');
  pushDelta('gh', -ghDrawn(nutrientsIn(uptake).nitrate, resources), 'uptake');
  pushDelta('kh', uptakeAlkalinity(uptake), 'uptake');

  // 3–4. What light, carbon and oxygen offer, and each budget's hour on it.
  const offered = offerCarbon(
    flora.map(({ fixer }) => fixer),
    resources.co2,
    waterVolume,
    plantsConfig
  ).map(photosynthateOf);
  const steps = flora.map(({ budget, condition, p, room, stress }, i) => {
    const fed = takeUp(budget, delivery.delivered[i]);
    return stepFlora(fed, p, {
      offered: offered[i],
      tau,
      omega,
      room,
      stress,
      healing: repairAsked(fed, p, condition, tau, plantsConfig),
    });
  });

  const assimilated = sum(steps.map(({ fluxes }) => fluxes.assimilated));
  const burned = sum(steps.map(({ fluxes }) => totalBurned(fluxes)));
  const fixed = carbonGases(assimilated);
  const respired = carbonGases(burned);
  pushDelta('co2', -getPpm(fixed.co2, waterVolume), 'photosynthesis');
  pushDelta('oxygen', getPpm(fixed.oxygen, waterVolume), 'photosynthesis');
  pushDelta('co2', getPpm(respired.co2, waterVolume), 'respiration');
  pushDelta('oxygen', -getPpm(respired.oxygen, waterVolume), 'respiration');

  // 5. Condition.
  const vitalities = state.plants.map((plant, i) =>
    computePlantVitality({
      plant,
      params: plants[i].p,
      fluxes: steps[i].fluxes,
      resources,
      waterVolume,
      plantsConfig,
      light: light[i],
    })
  );
  const bloomVitalities = blooms.map((b, k) =>
    computeAlgaeVitality({
      bloom: state.algae[b.kind],
      fluxes: steps[plantCount + k].fluxes,
      traits: b.traits,
      params: b.p,
      resources,
      plantsConfig,
    })
  );
  const conditions = [...vitalities, ...bloomVitalities].map((vitality) => vitality.newCondition);

  // 6. Losses: low condition sheds, condition 0 kills.
  const losses = flora.map(({ p }, i) => loseFlora(steps[i].state, p, conditions[i], plantsConfig));
  const plantLosses = losses.slice(0, plantCount);
  const bloomLosses = losses.slice(plantCount);
  const plantShedding = addOrganics(...plantLosses.map((loss) => loss.shed));
  pushWaste(plantShedding, 'plant-shedding');
  pushWaste(addOrganics(...plantLosses.map((loss) => loss.died)), 'plant-death');
  pushWaste(addOrganics(...bloomLosses.map((loss) => loss.shed)), 'algae-shedding');
  pushWaste(addOrganics(...bloomLosses.map((loss) => loss.died)), 'algae-death');
  effects.push(...leach(mapNutrients((n) => sum(losses.map((loss) => loss.leachate[n])))));

  // 7. A buffer that holds a unit cuts it loose.
  const offshoots = state.plants.map((plant, i) => {
    const survivor = plantLosses[i].survivor;
    if (survivor === null) return null;
    return buyOffshoot(survivor, plants[i].p, offshootStructure(plant.species));
  });

  // 8. Offshoots and spores join, the survivors age a tick. An offshoot's id and vigour come off the tank's stream.
  const newState = produce(state, (draft) => {
    for (const n of NUTRIENTS) draft.equipment.substrate.nutrients[n] -= fromBed[n];
    const log = (severity: LogSeverity, text: string | LogText, event: LogEvent): void => {
      draft.logs.push(createLog(draft.tick, 'simulation', severity, text, event));
    };

    const survivors: Plant[] = [];
    const born: Plant[] = [];
    state.plants.forEach((plant, i) => {
      const species = PLANT_SPECIES_DATA[plant.species];
      const { survivor } = plantLosses[i];
      if (survivor === null) {
        log('warning', `${species.name} died from poor conditions`, 'plant-died');
        return;
      }
      const bought = offshoots[i];
      const parent: Plant = {
        ...plant,
        budget: bought?.parent ?? survivor,
        condition: conditions[i],
        age: plant.age + 1,
      };
      survivors.push(parent);
      if (bought) {
        born.push(createOffshoot(parent, bought.offshoot, draft.rng));
        log('info', `${species.name} ${growthFormOf(plant.species).offshootVerb}`, 'plant-propagated');
      }
    });
    draft.plants = [...survivors, ...born];

    blooms.forEach(({ kind, traits, habitat }, k) => {
      const { survivor } = bloomLosses[k];
      const condition = conditions[plantCount + k];
      const mass = massOf(steps[plantCount + k].state.structure, habitat, traits);
      if (survivor === null && mass >= BLOOM_VISIBLE_LINE) {
        log('warning', measured`${traits.name} died back from ${coverage(mass)} coverage`, 'algae-died');
      }
      draft.algae[kind] = landSpores(survivor === null ? null : { budget: survivor, condition }, spores[k]);
    });
  });

  return {
    state: newState,
    effects,
    vitalities,
    light,
    fluxes: steps.slice(0, plantCount).map(({ fluxes }) => fluxes),
    shedding: plantShedding,
    waterUptake: plantUptake,
    algae: mapKinds((_, k) => ({
      vitality: bloomVitalities[k],
      light: blooms[k].light,
      fluxes: steps[plantCount + k].fluxes,
      shedding: bloomLosses[k].shed,
      waterUptake: bloomUptakes[k],
      spores: spores[k].structure,
      exudates: exudates.assimilation,
    })),
  };
}
