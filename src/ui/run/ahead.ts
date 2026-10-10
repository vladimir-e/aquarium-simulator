/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the flora pass — plants and the blooms — with its effects
 * applied, the livestock, then their bodies. Every readout that says what the next
 * tick will do reads it here, so a plant, a fish and a bloom are read on the
 * same hour.
 */

import {
  applyEffects,
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
  type FishVitality,
  type PlantLight,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import type { FormVector, TunableConfig } from '../../simulation/config/index.js';
import { ammoniaPerGramOfFood } from '../../simulation/config/livestock.js';
import { sum } from '../../simulation/core/sum.js';
import { TICKS_PER_DAY } from '../utils/clock.js';

/** One organism on the hour ahead. */
export interface OrganismAhead {
  vitality: VitalityResult;
  /** What its bank buys over the hour — a plant's growth and offshoot, a bloom's mass; nothing where it dies. */
  spent: number;
}

export interface PlantAhead extends OrganismAhead {
  light: PlantLight;
  /** Whether what it buys includes an offshoot. */
  buds: boolean;
}

export interface FishAhead {
  vitality: FishVitality;
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
  /** The bank as the tick leaves the bloom, the spores' share of it empty. */
  surplus: number;
  /** Grams of waste it sheds — its steady rate, apart from a die-back's lump. */
  shedding: number;
  /** mg of each form its new tissue takes up from the water. */
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
  /** Grams of waste the plants shed — their steady rate, apart from a death's one-off lump. */
  shedding: number;
  /** Grams of waste the fish pass and their clutches leave. */
  fishWaste: number;
  /** mg of NH₃ the fish excrete through their gills. */
  gillAmmonia: number;
  /** Grams of food a day that would pay the fish's upkeep at the hour's pace. */
  ration: number;
  /** Grams of waste decaying food leaves, off what the fish have not eaten. */
  foodWaste: number;
  /** mg of NH₃ the oxidised share of that food releases straight into the water. */
  foodAmmonia: number;
  /** mg of each form the plants' new tissue takes up from the water. */
  waterUptake: FormVector;
}

/**
 * What each organism's bank bought over the hour: what its vitality left in the
 * bank, less what the tick leaves there. One the tick no longer holds died, and
 * a death buys nothing.
 */
function spentBy(
  after: readonly { id: string; surplus: number }[]
): (id: string, vitality: VitalityResult) => number {
  const banks = new Map(after.map((organism) => [organism.id, organism.surplus]));
  return (id, vitality) => {
    const left = banks.get(id);
    return left === undefined ? 0 : vitality.surplus - left;
  };
}

export function readHourAhead(state: SimulationState, config: TunableConfig): HourAhead {
  const settled = settleEnvironment(state, config);
  const flora = processFlora(settled, config);
  const planted = applyEffects(flora.state, flora.effects, config);
  const livestock = processLivestock(planted, config);
  const bodies = processBodies(applyEffects(livestock.state, livestock.effects, config), config);
  const plantSpent = spentBy(planted.plants);
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
  const food = bodies.state.resources;
  const decayed = calculateDecay(food.food, food.temperature, food.oxygen, config.decay);
  const wasteShare = config.decay.wasteConversionRatio;

  return {
    plants: state.plants.map((plant, i) => ({
      vitality: flora.vitalities[i],
      spent: plantSpent(plant.id, flora.vitalities[i]),
      light: flora.light[i],
      buds: budded.has(plant.id),
    })),
    fish: state.fish.map((fish, i) => ({
      vitality: livestock.vitalities[i],
      hour: livestock.hours[i],
      broods: broods.has(fish.id),
    })),
    algae: mapKinds((kind) => ({ ...flora.algae[kind], ...planted.algae[kind] })),
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: flora.shedding,
    fishWaste: livestock.feces + bodies.waste,
    gillAmmonia: gillAmmonia(livestock.burned + bodies.burned, config.livestock),
    ration: TICKS_PER_DAY * sum(livestock.hours.map((hour) => ration(hour.fish, hour.fluxes.owed))),
    foodWaste: decayed * wasteShare,
    foodAmmonia: decayed * (1 - wasteShare) * ammoniaPerGramOfFood(config.livestock),
    waterUptake: flora.waterUptake,
  };
}
