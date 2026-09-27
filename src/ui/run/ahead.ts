/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the flora pass — plants and the bloom — with its effects
 * applied, the livestock, then breeding. Every readout that says what the next
 * tick will do reads it here, so a plant, a fish and the bloom are read on the
 * same hour.
 */

import {
  applyEffects,
  calculateDecay,
  dailyLightIntegral,
  processBreeding,
  processFlora,
  processLivestock,
  type BloomLight,
  type PlantLight,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { ammoniaPerGramOfFood } from '../../simulation/config/livestock.js';

/** One organism on the hour ahead. */
export interface OrganismAhead {
  vitality: VitalityResult;
  /** What its bank buys over the hour — a plant's growth and offshoot, a bloom's mass, a fish's brood; nothing where it dies. */
  spent: number;
}

export interface PlantAhead extends OrganismAhead {
  light: PlantLight;
  /** Whether what it buys includes an offshoot. */
  buds: boolean;
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
}

export interface HourAhead {
  /** In `state.plants` order. */
  plants: PlantAhead[];
  /** In `state.fish` order. */
  fish: OrganismAhead[];
  algae: BloomAhead;
  /** The substrate's day of light the tick reads, mol/m²/d. */
  dailyLight: number;
  /** Grams of waste the plants shed — their steady rate, apart from a death's one-off lump. */
  shedding: number;
  /** Grams of waste the fish pass. */
  fishWaste: number;
  /** mg of NH₃ the fish excrete through their gills. */
  gillAmmonia: number;
  /** Grams of waste decaying food leaves, off what the fish have not eaten. */
  foodWaste: number;
  /** mg of NH₃ the oxidised share of that food releases straight into the water. */
  foodAmmonia: number;
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
  const bred = processBreeding(applyEffects(livestock.state, livestock.effects, config), config).state;
  const plantSpent = spentBy(planted.plants);
  const fishSpent = spentBy(bred.fish);
  const standing = new Set(state.plants.map((plant) => plant.id));
  const budded = new Set(
    planted.plants.filter((plant) => !standing.has(plant.id)).map((plant) => plant.parentId)
  );
  const bloom = planted.algae;
  const food = bred.resources;
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
      spent: fishSpent(fish.id, livestock.vitalities[i]),
    })),
    algae: {
      vitality: flora.algae.vitality,
      spent: flora.algae.spent,
      light: flora.algae.light,
      condition: bloom.condition,
      mass: bloom.mass,
      surplus: bloom.surplus,
      shedding: flora.algae.shedding,
    },
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: flora.shedding,
    fishWaste: livestock.metabolism.wasteProduced,
    gillAmmonia: livestock.metabolism.ammoniaProduced,
    foodWaste: decayed * wasteShare,
    foodAmmonia: decayed * (1 - wasteShare) * ammoniaPerGramOfFood(config.livestock),
  };
}
