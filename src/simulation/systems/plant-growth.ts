/**
 * Plant growth — surplus-driven, per plant, no cross-plant sharing.
 *
 * Each plant's vitality banks surplus on `Plant.surplus` when condition
 * is full and net is positive (capped at `surplusCap`). This module
 * spends the bank: every lit tick a plant mobilises `growthDrawRate` of
 * it toward new tissue, and the asymptotic factor decides how much of
 * that becomes size. **Only what became size leaves the bank** — a
 * plant at its ceiling converts nothing and pays nothing, so its whole
 * income banks instead of burning. That reserve is what rides out a
 * dark spell, and what propagation will spend on runners.
 *
 * The bank therefore settles where the draw meets the income rather
 * than emptying: growth stays limited by what the plant earns, and a
 * plant that earns more both grows faster and holds more in reserve.
 *
 * No tank-wide overgrowth penalty, no biomass redistribution, no
 * 200 % waste-dump backstop. Each plant runs against its own bank and
 * its own ceiling.
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
 * The share of mobilised surplus a plant can still turn into size — 1
 * at size 0, decaying to 0 at `maxSize`, so each plant self-limits to
 * its species ceiling and the rest stays banked.
 */
export function asymptoticGrowthFactor(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0;
  return Math.max(0, 1 - size / maxSize);
}

/**
 * Spend a plant's banked surplus on growth for one tick.
 *
 * The plant mobilises `growthDrawRate` of its bank and converts the
 * asymptotic share of that into size at
 * `speciesGrowthRate × sizePerSurplus`. The converted units are what
 * leaves the bank, so the withdrawal is the price of the growth
 * delivered and nothing else.
 *
 * Returns a new plant with updated `surplus` and `size`. The original
 * is untouched.
 */
export function spendSurplusOnGrowth(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): Plant {
  if (plant.surplus <= 0) return plant;

  const converted =
    plant.surplus *
    config.growthDrawRate *
    asymptoticGrowthFactor(plant.size, getSpeciesMaxSize(plant.species));
  const sizeGained = converted * getSpeciesGrowthRate(plant.species) * config.sizePerSurplus;

  return {
    ...plant,
    size: plant.size + sizeGained,
    surplus: plant.surplus - converted,
  };
}
