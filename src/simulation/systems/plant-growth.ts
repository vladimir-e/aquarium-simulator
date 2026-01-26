/**
 * Plant growth and biomass distribution.
 *
 * After photosynthesis produces aggregate biomass:
 * 1. Apply overgrowth penalty if any plant > 100%
 * 2. Distribute biomass to individual plants by species growth rate
 * 3. Handle extreme overgrowth (>200%) by releasing waste
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

  // Distribute biomass to each plant based on their growth rate share
  const updatedPlants = plants.map((plant) => {
    const growthRate = getSpeciesGrowthRate(plant.species);
    const share = growthRate / totalGrowthRate;
    const sizeIncrease = effectiveBiomass * share * config.sizePerBiomass;
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
