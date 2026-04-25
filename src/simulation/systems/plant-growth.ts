/**
 * Plant growth — surplus-driven, per plant, no cross-plant sharing.
 *
 * Each plant's vitality emits surplus when condition is full and net
 * is positive. The bank lives on `Plant.surplus`. This module spends
 * the bank: every tick, drain up to `plantGrowthPerTickCap` units;
 * convert the drained portion into a size delta scaled by species
 * growth rate, the per-`sizePerSurplus` knob, and an asymptotic factor
 * that decays toward zero as the plant approaches its species
 * `maxSize`. The bank's leftover stays — future propagation work will
 * read it.
 *
 * No tank-wide overgrowth penalty, no biomass redistribution, no
 * 200 % waste-dump backstop. Each plant runs against its own bank and
 * its own ceiling.
 */

import type { Plant, PlantSpecies } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
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
 * At size = 0 the plant gains size at full efficiency; as it
 * approaches `maxSize` the factor decays smoothly toward zero, so
 * each plant self-limits to its species ceiling.
 */
export function asymptoticGrowthFactor(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0;
  return Math.max(0, 1 - size / maxSize);
}

/**
 * Spend a plant's banked surplus on growth for one tick.
 *
 * Drains `min(plant.surplus, plantGrowthPerTickCap)` from the bank.
 * The drained units convert to size at rate
 * `drained × asymptoticFactor × speciesGrowthRate × sizePerSurplus`,
 * so the asymptotic factor reduces *spending efficiency* rather than
 * *withdrawal amount* — a plant near `maxSize` keeps drawing surplus
 * at full rate but gets less size per unit drawn.
 *
 * Returns a new plant with updated `surplus` and `size`. The original
 * is untouched.
 */
export function spendSurplusOnGrowth(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): Plant {
  if (plant.surplus <= 0) return plant;

  const drained = Math.min(plant.surplus, config.plantGrowthPerTickCap);
  const factor = asymptoticGrowthFactor(plant.size, getSpeciesMaxSize(plant.species));
  const speciesRate = getSpeciesGrowthRate(plant.species);
  const sizeIncrease = drained * factor * speciesRate * config.sizePerSurplus;

  return {
    ...plant,
    size: plant.size + sizeIncrease,
    surplus: plant.surplus - drained,
  };
}
