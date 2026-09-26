/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the plant pass with its effects applied, the algae, the
 * livestock, then breeding. Every readout that says what the next tick will do
 * reads it here, so a plant, a fish and the bloom are read on the same hour.
 */

import {
  applyEffects,
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
  /** Its bank as the tick leaves it — what the bank bought taken out, 0 where it dies. */
  bank: number;
}

export interface PlantAhead extends OrganismAhead {
  light: PlantLight;
}

export interface HourAhead {
  /** In `state.plants` order. */
  plants: PlantAhead[];
  /** In `state.fish` order. */
  fish: OrganismAhead[];
  algae: AlgaePopulationResult;
  /** Coverage as the tick leaves the bloom. */
  algaeMass: number;
  /** The substrate's day of light the tick reads, mol/m²/d. */
  dailyLight: number;
  /** Grams of waste the plants shed — their steady rate, apart from a death's one-off lump. */
  shedding: number;
  /** Grams of waste the fish pass. */
  fishWaste: number;
  /** mg of NH₃ the fish excrete through their gills. */
  gillAmmonia: number;
}

function banks(organisms: readonly { id: string; surplus: number }[]): Map<string, number> {
  return new Map(organisms.map((organism) => [organism.id, organism.surplus]));
}

export function readHourAhead(state: SimulationState, config: TunableConfig): HourAhead {
  const settled = settleEnvironment(state, config);
  const plantPass = processPlants(settled, config);
  const planted = applyEffects(plantPass.state, plantPass.effects, config);
  const algaePass = processAlgae(planted, config);
  const livestock = processLivestock(algaePass.state, config);
  const bred = processBreeding(applyEffects(livestock.state, livestock.effects, config), config).state;
  const plantBanks = banks(planted.plants);
  const fishBanks = banks(bred.fish);

  return {
    plants: state.plants.map((plant, i) => ({
      vitality: plantPass.vitalities[i],
      bank: plantBanks.get(plant.id) ?? 0,
      light: plantPass.light[i],
    })),
    fish: state.fish.map((fish, i) => ({
      vitality: livestock.vitalities[i],
      bank: fishBanks.get(fish.id) ?? 0,
    })),
    algae: algaePass.population,
    algaeMass: algaePass.state.algae.mass,
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: plantPass.shedding,
    fishWaste: livestock.metabolism.wasteProduced,
    gillAmmonia: livestock.metabolism.ammoniaProduced,
  };
}
