/**
 * Plant growth — the bank buys size.
 *
 * Each plant's vitality banks the income it earns at full condition, on
 * `Plant.surplus` and capped at `surplusCap`. Every tick, day and night, a
 * plant draws `growthDrawRate` of the bank toward new tissue through the taper
 * `1 − size/100`, which closes the draw down as its unit fills. Only what
 * becomes size leaves the bank, so a full plant keeps its income banked
 * against a bad spell.
 *
 * Nothing clamps size: within the tunables' bounds and the roster's growth
 * rates one tick buys at most 0.72 of what is left to 100, so the taper keeps
 * every plant below it.
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

/** Share of the draw a plant can still turn into size: 1 at size 0, none at 100. */
export function growthTaper(size: number): number {
  return 1 - size / 100;
}

export function spendSurplus(plant: Plant, config: PlantsConfig = plantsDefaults): Plant {
  // A restored save carries any finite `growthDrawRate`; one above 1 would
  // otherwise drive the bank negative.
  const converted =
    Math.max(0, plant.surplus) * Math.min(1, config.growthDrawRate) * growthTaper(plant.size);
  if (converted <= 0) return plant;

  return {
    ...plant,
    size: plant.size + converted * getSpeciesGrowthRate(plant.species) * config.sizePerSurplus,
    surplus: plant.surplus - converted,
  };
}
