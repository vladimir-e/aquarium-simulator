/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the flora pass — plants and the blooms — with its effects
 * applied, the livestock, then their bodies. Every readout that says what the next
 * tick will do reads it here, so a plant, a fish and a bloom are read on the
 * same hour.
 */

import {
  addOrganics,
  applyEffects,
  bloomMass,
  calculateDecay,
  dailyLightIntegral,
  gillAmmonia,
  mapKinds,
  processBodies,
  processFlora,
  paysTowardBrood,
  processLivestock,
  ration,
  readyToBrood,
  type AlgaeKind,
  type BloomLight,
  type FishHour,
  type FloraFluxes,
  type Organics,
  type PlantLight,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import type { FormVector, TunableConfig } from '../../simulation/config/index.js';
import { ammoniaPerGramOfFood } from '../../simulation/config/livestock.js';
import { sum } from '../../simulation/core/sum.js';
import { TICKS_PER_DAY } from '../utils/clock.js';

/** One flora on the hour ahead. */
export interface OrganismAhead {
  vitality: VitalityResult;
  /** What its budget does over the hour. */
  fluxes: FloraFluxes;
}

export interface PlantAhead extends OrganismAhead {
  light: PlantLight;
  /** Whether its buffer buys an offshoot over the hour. */
  buds: boolean;
}

export interface FishAhead {
  vitality: VitalityResult;
  /** Its budget's hour: its pace, what it digested, what the budget did. */
  hour: FishHour;
  /** Whether it spawns or fathers a brood over the hour. */
  broods: boolean;
}

export interface BloomAhead extends OrganismAhead {
  light: BloomLight;
  /** Condition as the tick leaves the bloom, its spores landed. */
  condition: number;
  /** Coverage as the tick leaves the bloom. */
  mass: number;
  /** Waste it sheds — its steady rate, apart from a die-back's lump. */
  shedding: Organics;
  /** mg of each form its stores and spores take up from the water. */
  waterUptake: FormVector;
}

export interface HourAhead {
  /** In `state.plants` order. */
  plants: PlantAhead[];
  /** In `state.fish` order. */
  fish: FishAhead[];
  algae: Record<AlgaeKind, BloomAhead>;
  /** The substrate's day of light the tick reads, mol/m²/d. */
  dailyLight: number;
  /** Waste the plants shed — their steady rate, apart from a death's one-off lump. */
  shedding: Organics;
  /** Waste the fish pass and their clutches leave. */
  fishWaste: Organics;
  /** mg of NH₃ the fish excrete through their gills. */
  gillAmmonia: number;
  /** Grams of food a day that would pay the fish's upkeep at the hour's pace. */
  ration: number;
  /** Grams of waste decaying food leaves, off what the fish have not eaten. */
  foodWaste: number;
  /** mg of NH₃ the oxidised share of that food releases straight into the water. */
  foodAmmonia: number;
  /** mg of each form the plants' stores take up from the water. */
  waterUptake: FormVector;
}

export function readHourAhead(state: SimulationState, config: TunableConfig): HourAhead {
  const settled = settleEnvironment(state, config);
  const flora = processFlora(settled, config);
  const planted = applyEffects(flora.state, flora.effects, config);
  const livestock = processLivestock(planted, config);
  const bodies = processBodies(applyEffects(livestock.state, livestock.effects, config), config);
  const standingClutches = new Set(livestock.state.clutches.map((clutch) => clutch.id));
  const tended = bodies.state.clutches.filter((clutch) => standingClutches.has(clutch.id));
  const layers = livestock.state.fish.filter((fish) => readyToBrood(fish, tended));
  const brooding = new Set(layers.map((fish) => fish.species));
  const fathers = livestock.state.fish.filter((fish) => brooding.has(fish.species) && paysTowardBrood(fish));
  const broods = new Set([...layers, ...fathers].map((fish) => fish.id));
  const standing = new Set(state.plants.map((plant) => plant.id));
  const budded = new Set(
    planted.plants.filter((plant) => !standing.has(plant.id)).map((plant) => plant.parentId)
  );
  const water = applyEffects(bodies.state, bodies.effects, config).resources;
  const decayed = calculateDecay(water.food, water.temperature, water.oxygen, config.decay);
  const wasteShare = config.decay.wasteConversionRatio;

  return {
    plants: state.plants.map((plant, i) => ({
      vitality: flora.vitalities[i],
      fluxes: flora.fluxes[i],
      light: flora.light[i],
      buds: budded.has(plant.id),
    })),
    fish: state.fish.map((fish, i) => ({
      vitality: livestock.vitalities[i],
      hour: livestock.hours[i],
      broods: broods.has(fish.id),
    })),
    algae: mapKinds((kind) => ({
      ...flora.algae[kind],
      condition: planted.algae[kind].condition,
      mass: bloomMass(planted, kind),
    })),
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: flora.shedding,
    fishWaste: addOrganics(livestock.feces, bodies.waste),
    gillAmmonia: gillAmmonia(livestock.burned + bodies.burned, config.livestock),
    ration: TICKS_PER_DAY * sum(livestock.hours.map((hour) => ration(hour.fish, hour.fluxes.owed))),
    foodWaste: decayed * wasteShare,
    foodAmmonia: decayed * (1 - wasteShare) * ammoniaPerGramOfFood(config.livestock),
    waterUptake: flora.waterUptake,
  };
}
