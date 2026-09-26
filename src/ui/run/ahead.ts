/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the plant pass with its effects applied, the algae, the
 * livestock, then breeding. Every readout that says what the next tick will do
 * reads it here, so a plant, a fish and the bloom are read on the same hour.
 */

import {
  applyEffects,
  calculateDecay,
  dailyLightIntegral,
  processAlgae,
  processBreeding,
  processLivestock,
  processPlants,
  type AlgaePopulationResult,
  type PlantLight,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import type { TunableConfig } from '../../simulation/config/index.js';

/** One organism on the hour ahead. */
export interface OrganismAhead {
  vitality: VitalityResult;
  /** What its bank buys over the hour — a plant's growth and offshoot, a fish's brood; nothing where it dies. */
  spent: number;
}

export interface PlantAhead extends OrganismAhead {
  light: PlantLight;
  /** Whether what it buys includes an offshoot. */
  buds: boolean;
}

/** The bloom's bank over the hour. */
export interface BloomBankAhead {
  /** Drawn down to cover damage. */
  drained: number;
  /** Spent on coverage. */
  spent: number;
  /** As the tick leaves it. */
  next: number;
}

export interface HourAhead {
  /** In `state.plants` order. */
  plants: PlantAhead[];
  /** In `state.fish` order. */
  fish: OrganismAhead[];
  algae: AlgaePopulationResult;
  /** Coverage as the tick leaves the bloom. */
  algaeMass: number;
  algaeBank: BloomBankAhead;
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
  const plantPass = processPlants(settled, config);
  const planted = applyEffects(plantPass.state, plantPass.effects, config);
  const algaePass = processAlgae(planted, config);
  const livestock = processLivestock(algaePass.state, config);
  const bred = processBreeding(applyEffects(livestock.state, livestock.effects, config), config).state;
  const plantSpent = spentBy(planted.plants);
  const fishSpent = spentBy(bred.fish);
  const standing = new Set(state.plants.map((plant) => plant.id));
  const budded = new Set(
    planted.plants.filter((plant) => !standing.has(plant.id)).map((plant) => plant.parentId)
  );
  const bloom = algaePass.state.algae.surplus;
  const food = bred.resources;

  return {
    plants: state.plants.map((plant, i) => ({
      vitality: plantPass.vitalities[i],
      spent: plantSpent(plant.id, plantPass.vitalities[i]),
      light: plantPass.light[i],
      buds: budded.has(plant.id),
    })),
    fish: state.fish.map((fish, i) => ({
      vitality: livestock.vitalities[i],
      spent: fishSpent(fish.id, livestock.vitalities[i]),
    })),
    algae: algaePass.population,
    algaeMass: algaePass.state.algae.mass,
    algaeBank: {
      drained: algaePass.bank.drained,
      spent: algaePass.bank.surplus - bloom,
      next: bloom,
    },
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: plantPass.shedding,
    fishWaste: livestock.metabolism.wasteProduced,
    gillAmmonia: livestock.metabolism.ammoniaProduced,
    foodWaste:
      calculateDecay(food.food, food.temperature, food.oxygen, config.decay) *
      config.decay.wasteConversionRatio,
  };
}
