/**
 * Plant growth — the bank buys size.
 *
 * Each plant's vitality banks the income it earns at full condition, on
 * `Plant.surplus` and capped at `surplusCap`. Every tick, day and night, a
 * plant draws `growthDrawRate` of the bank toward new tissue, through the
 * asymptotic factor that closes the draw down as it nears its species
 * `maxSize`. Only what becomes size leaves the bank, so a plant at its ceiling
 * keeps its income banked against a bad spell.
 */

import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

/**
 * Get the growth rate for a plant species. Per-species multiplier on
 * surplus → size conversion (slow Anubias 0.3, fast Monte Carlo 1.8).
 */
export function getSpeciesGrowthRate(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].growthRate;
}

/** Per-species size ceiling. */
export function getSpeciesMaxSize(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].maxSize;
}

/**
 * Asymptotic growth throttle: `factor = max(0, 1 - size / maxSize)`.
 * The share of the draw a plant can still turn into size — 1 at size 0,
 * decaying to 0 at `maxSize`, so each plant self-limits to its species
 * ceiling and the rest stays banked.
 */
export function asymptoticGrowthFactor(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0;
  return Math.max(0, 1 - size / maxSize);
}

export function spendSurplus(plant: Plant, config: PlantsConfig = plantsDefaults): Plant {
  // A restored save carries any finite `growthDrawRate`; one above 1 would
  // otherwise drive the bank negative.
  const converted =
    Math.max(0, plant.surplus) *
    Math.min(1, config.growthDrawRate) *
    asymptoticGrowthFactor(plant.size, getSpeciesMaxSize(plant.species));
  if (converted <= 0) return plant;

  return {
    ...plant,
    size: plant.size + converted * getSpeciesGrowthRate(plant.species) * config.sizePerSurplus,
    surplus: plant.surplus - converted,
  };
}
