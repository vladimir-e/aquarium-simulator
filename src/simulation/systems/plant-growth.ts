/**
 * Plant growth and biomass distribution.
 *
 * After photosynthesis produces aggregate biomass:
 * 1. Apply overgrowth penalty if any plant > 100%
 * 2. Distribute biomass to individual plants by species growth rate
 * 3. Throttle each plant's per-tick growth by an asymptotic factor that
 *    decays toward zero as the plant approaches its species `maxSize`.
 * 4. Handle extreme overgrowth (>200%) by releasing waste — backstop only;
 *    the asymptotic factor self-limits normal growth so this should rarely
 *    fire in long-running tanks.
 */

import type { Plant, PlantSpecies } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

export interface GrowthResult {
  /** Updated plants with new sizes */
  updatedPlants: Plant[];
  /** Waste released from extreme overgrowth (grams) */
  wasteReleased: number;
  /** Overgrowth penalty applied (0-1, 0 = no penalty) */
  overgrowthPenalty: number;
}

/**
 * Calculate the maximum size among all plants.
 */
export function getMaxPlantSize(plants: readonly Plant[]): number {
  if (plants.length === 0) return 0;
  return Math.max(...plants.map((p) => p.size));
}

/**
 * Calculate overgrowth penalty based on maximum plant size.
 * Penalty scales from 0% at 100% size to 50% at 200% size.
 */
export function calculateOvergrowthPenalty(
  maxSize: number,
  config: PlantsConfig = plantsDefaults
): number {
  if (maxSize <= 100) return 0;
  // Penalty = (maxSize - 100) / overgrowthPenaltyScale, capped at 0.5
  return Math.min(0.5, (maxSize - 100) / config.overgrowthPenaltyScale);
}

/**
 * Get the growth rate for a plant species.
 */
export function getSpeciesGrowthRate(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].growthRate;
}

/**
 * Get the species-level maximum size cap.
 */
export function getSpeciesMaxSize(species: PlantSpecies): number {
  return PLANT_SPECIES_DATA[species].maxSize;
}

/**
 * Asymptotic growth throttle, applied per plant after share distribution.
 *
 * `factor = max(0, 1 - size / maxSize)` — biological cap. At `size = 0` the
 * plant grows at the unmodified rate; as it approaches `maxSize` growth
 * decays smoothly toward zero, so each plant self-limits to its species
 * ceiling instead of needing the 200 % waste-dump backstop to catch it.
 *
 * Sized so that `size / maxSize < 0.1` across calibration windows — the
 * factor stays > 0.9 there, effectively transparent to baseline numbers.
 */
export function asymptoticGrowthFactor(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0;
  return Math.max(0, 1 - size / maxSize);
}

/**
 * Distribute biomass to plants and handle overgrowth.
 *
 * @param plants - Current plant array
 * @param biomassProduced - Aggregate biomass from photosynthesis
 * @param config - Plants configuration
 * @returns Growth result with updated plants and any waste released
 */
export function distributeBiomass(
  plants: readonly Plant[],
  biomassProduced: number,
  config: PlantsConfig = plantsDefaults
): GrowthResult {
  if (plants.length === 0 || biomassProduced <= 0) {
    return {
      updatedPlants: plants.map((p) => ({ ...p })),
      wasteReleased: 0,
      overgrowthPenalty: 0,
    };
  }

  // Calculate overgrowth penalty
  const maxSize = getMaxPlantSize(plants);
  const overgrowthPenalty = calculateOvergrowthPenalty(maxSize, config);

  // Apply penalty to effective biomass
  const effectiveBiomass = biomassProduced * (1 - overgrowthPenalty);

  // Calculate total growth rate across all plants
  const totalGrowthRate = plants.reduce(
    (sum, plant) => sum + getSpeciesGrowthRate(plant.species),
    0
  );

  // Guard against division by zero (shouldn't happen with valid species, but defensive)
  if (totalGrowthRate === 0) {
    return {
      updatedPlants: plants.map((p) => ({ ...p })),
      wasteReleased: 0,
      overgrowthPenalty,
    };
  }

  // Distribute biomass to each plant based on their growth rate share, then
  // throttle by the per-plant asymptotic factor so plants self-limit toward
  // their species `maxSize` instead of relying on the 200 % waste-dump
  // backstop. Applied AFTER share distribution so a faster-growing plant
  // approaching its cap doesn't starve slower neighbours of biomass — only
  // its own share is dampened.
  const updatedPlants = plants.map((plant) => {
    const growthRate = getSpeciesGrowthRate(plant.species);
    const share = growthRate / totalGrowthRate;
    const maxSize = getSpeciesMaxSize(plant.species);
    const factor = asymptoticGrowthFactor(plant.size, maxSize);
    const sizeIncrease = effectiveBiomass * share * config.sizePerBiomass * factor;
    return {
      ...plant,
      size: plant.size + sizeIncrease,
    };
  });

  // Handle extreme overgrowth (>200%) - release waste and cap size
  let wasteReleased = 0;
  for (const plant of updatedPlants) {
    if (plant.size > 200) {
      const excess = plant.size - 200;
      wasteReleased += excess * config.wastePerExcessSize;
      plant.size = 200;
    }
  }

  return {
    updatedPlants,
    wasteReleased,
    overgrowthPenalty,
  };
}
