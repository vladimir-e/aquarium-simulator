/**
 * Nutrients system - handles plant nutrient sufficiency, condition, and consumption.
 *
 * Key concepts:
 * - Plants have nutrient demand levels (low/medium/high)
 * - Nutrient sufficiency is calculated per plant based on available nutrients
 * - Condition improves when nutrients sufficient, degrades when insufficient
 * - Low condition triggers shedding, very low condition causes death
 * - Plants consume nutrients proportionally to fertilizer formula ratio
 */

import type { Resources, Plant, PlantSpecies, NutrientDemand } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import type { NutrientsConfig } from '../config/nutrients.js';
import { nutrientsDefaults, getNutrientRatio } from '../config/nutrients.js';
import { getPpm } from '../resources/index.js';

/**
 * Result of processing a plant's nutrient status.
 */
export interface PlantNutrientResult {
  /** Updated plant with new condition and possibly reduced size */
  plant: Plant;
  /** Waste released from shedding (grams) */
  wasteReleased: number;
  /** Whether the plant died this tick */
  died: boolean;
  /** Nutrient sufficiency level (0-1) */
  sufficiency: number;
}

/**
 * Result of nutrient consumption by all plants.
 */
export interface NutrientConsumptionResult {
  /** Nitrate consumed (mg) */
  nitrateConsumed: number;
  /** Phosphate consumed (mg) */
  phosphateConsumed: number;
  /** Potassium consumed (mg) */
  potassiumConsumed: number;
  /** Iron consumed (mg) */
  ironConsumed: number;
}

/**
 * Get the demand multiplier for a nutrient demand level.
 */
export function getDemandMultiplier(
  demand: NutrientDemand,
  config: NutrientsConfig = nutrientsDefaults
): number {
  switch (demand) {
    case 'low':
      return config.lowDemandMultiplier;
    case 'medium':
      return config.mediumDemandMultiplier;
    case 'high':
      return config.highDemandMultiplier;
  }
}

/**
 * Calculate nutrient sufficiency for a plant (0-1 scale).
 * Sufficiency is the minimum factor across all nutrients.
 * Low-demand plants can survive on less nutrients than high-demand plants.
 *
 * @param resources - Current resource state
 * @param waterVolume - Current water volume in liters
 * @param species - Plant species
 * @param config - Nutrients configuration
 * @returns Sufficiency factor (0-1, where 1 = fully sufficient)
 */
export function calculateNutrientSufficiency(
  resources: Resources,
  waterVolume: number,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): number {
  if (waterVolume <= 0) return 0;

  const speciesData = PLANT_SPECIES_DATA[species];
  const demand = getDemandMultiplier(speciesData.nutrientDemand, config);

  // Calculate current ppm for each nutrient
  const nitratePpm = getPpm(resources.nitrate, waterVolume);
  const phosphatePpm = getPpm(resources.phosphate, waterVolume);
  const potassiumPpm = getPpm(resources.potassium, waterVolume);
  const ironPpm = getPpm(resources.iron, waterVolume);

  // Calculate required ppm based on demand level
  const requiredNitrate = config.optimalNitratePpm * demand;
  const requiredPhosphate = config.optimalPhosphatePpm * demand;
  const requiredPotassium = config.optimalPotassiumPpm * demand;
  const requiredIron = config.optimalIronPpm * demand;

  // Calculate sufficiency factor for each nutrient (capped at 1)
  const factors = [
    requiredNitrate > 0 ? Math.min(1, nitratePpm / requiredNitrate) : 1,
    requiredPhosphate > 0 ? Math.min(1, phosphatePpm / requiredPhosphate) : 1,
    requiredPotassium > 0 ? Math.min(1, potassiumPpm / requiredPotassium) : 1,
    requiredIron > 0 ? Math.min(1, ironPpm / requiredIron) : 1,
  ];

  // Sufficiency is the minimum factor (Liebig's Law - limiting factor)
  return Math.min(...factors);
}

/**
 * Update a plant's condition based on nutrient sufficiency.
 *
 * @param condition - Current condition (0-100)
 * @param sufficiency - Nutrient sufficiency (0-1)
 * @param config - Nutrients configuration
 * @returns New condition (0-100)
 */
export function updatePlantCondition(
  condition: number,
  sufficiency: number,
  config: NutrientsConfig = nutrientsDefaults
): number {
  let newCondition = condition;

  if (sufficiency >= config.thrivingThreshold) {
    // Thriving: condition improves at full rate
    newCondition = Math.min(100, condition + config.conditionRecoveryRate);
  } else if (sufficiency >= config.adequateThreshold) {
    // Adequate: condition slowly improves (30% of recovery rate)
    newCondition = Math.min(100, condition + config.conditionRecoveryRate * 0.3);
  } else if (sufficiency >= config.strugglingThreshold) {
    // Struggling: condition slowly degrades (50% of decay rate)
    newCondition = Math.max(0, condition - config.conditionDecayRate * 0.5);
  } else {
    // Starving: rapid condition loss at full decay rate
    newCondition = Math.max(0, condition - config.conditionDecayRate);
  }

  return newCondition;
}

/**
 * Calculate shedding for a plant with low condition.
 *
 * @param plant - Current plant state
 * @param config - Nutrients configuration
 * @returns Object with size reduction and waste produced
 */
export function calculateShedding(
  plant: Plant,
  config: NutrientsConfig = nutrientsDefaults
): { sizeReduction: number; wasteProduced: number } {
  if (plant.condition >= config.sheddingConditionThreshold) {
    return { sizeReduction: 0, wasteProduced: 0 };
  }

  // Shedding rate scales with how low the condition is
  // At condition 0, rate = maxSheddingRate
  // At sheddingConditionThreshold, rate = 0
  const sheddingIntensity =
    (config.sheddingConditionThreshold - plant.condition) / config.sheddingConditionThreshold;
  const sheddingRate = sheddingIntensity * config.maxSheddingRate;

  const sizeReduction = plant.size * sheddingRate;
  const wasteProduced = sizeReduction * config.wastePerShedSize;

  return { sizeReduction, wasteProduced };
}

/**
 * Check if a plant should die based on condition and size.
 *
 * @param plant - Current plant state
 * @param config - Nutrients configuration
 * @returns Whether the plant dies
 */
export function shouldPlantDie(
  plant: Plant,
  config: NutrientsConfig = nutrientsDefaults
): boolean {
  return (
    plant.condition < config.deathConditionThreshold ||
    plant.size < config.deathSizeThreshold
  );
}

/**
 * Calculate waste produced when a plant dies.
 *
 * @param plant - Dying plant
 * @param config - Nutrients configuration
 * @returns Waste produced in grams
 */
export function calculateDeathWaste(
  plant: Plant,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return plant.size * config.wastePerPlantDeath;
}

/**
 * Process a single plant's nutrient status for one tick.
 * Updates condition, handles shedding, and checks for death.
 *
 * @param plant - Current plant state
 * @param sufficiency - Pre-calculated nutrient sufficiency
 * @param config - Nutrients configuration
 * @returns Result with updated plant, waste, and death status
 */
export function processPlantNutrients(
  plant: Plant,
  sufficiency: number,
  config: NutrientsConfig = nutrientsDefaults
): PlantNutrientResult {
  // Update condition based on sufficiency
  const newCondition = updatePlantCondition(plant.condition, sufficiency, config);

  // Create working copy of plant
  let updatedPlant: Plant = {
    ...plant,
    condition: newCondition,
  };

  let wasteReleased = 0;

  // Calculate shedding if condition is low
  const { sizeReduction, wasteProduced } = calculateShedding(updatedPlant, config);
  if (sizeReduction > 0) {
    updatedPlant = {
      ...updatedPlant,
      size: Math.max(0, updatedPlant.size - sizeReduction),
    };
    wasteReleased += wasteProduced;
  }

  // Check for death
  const died = shouldPlantDie(updatedPlant, config);
  if (died) {
    wasteReleased += calculateDeathWaste(updatedPlant, config);
    // Mark plant for removal by setting size to 0
    updatedPlant = {
      ...updatedPlant,
      size: 0,
    };
  }

  return {
    plant: updatedPlant,
    wasteReleased,
    died,
    sufficiency,
  };
}

/**
 * Calculate nutrient consumption for all plants.
 * Plants consume nutrients proportionally to the fertilizer formula ratio.
 * Consumption scales with total plant size and growth rate.
 *
 * @param totalPlantSize - Sum of all plant sizes (%)
 * @param resources - Current resource state
 * @param config - Nutrients configuration
 * @returns Nutrients consumed (clamped to available amounts)
 */
export function calculateNutrientConsumption(
  totalPlantSize: number,
  resources: Resources,
  config: NutrientsConfig = nutrientsDefaults
): NutrientConsumptionResult {
  if (totalPlantSize <= 0) {
    return {
      nitrateConsumed: 0,
      phosphateConsumed: 0,
      potassiumConsumed: 0,
      ironConsumed: 0,
    };
  }

  // Base consumption scales with plant size
  // totalPlantSize is in %, divide by 100 to get factor
  const baseConsumption = (totalPlantSize / 100) * config.baseConsumptionRate;

  // Get nutrient ratios from fertilizer formula
  const nitrateRatio = getNutrientRatio('nitrate', config.fertilizerFormula);
  const phosphateRatio = getNutrientRatio('phosphate', config.fertilizerFormula);
  const potassiumRatio = getNutrientRatio('potassium', config.fertilizerFormula);
  const ironRatio = getNutrientRatio('iron', config.fertilizerFormula);

  // Calculate raw consumption for each nutrient
  const rawNitrate = baseConsumption * nitrateRatio;
  const rawPhosphate = baseConsumption * phosphateRatio;
  const rawPotassium = baseConsumption * potassiumRatio;
  const rawIron = baseConsumption * ironRatio;

  // Clamp to available resources (can't consume more than available)
  return {
    nitrateConsumed: Math.min(rawNitrate, resources.nitrate),
    phosphateConsumed: Math.min(rawPhosphate, resources.phosphate),
    potassiumConsumed: Math.min(rawPotassium, resources.potassium),
    ironConsumed: Math.min(rawIron, resources.iron),
  };
}

/**
 * Get the limiting nutrient factor for a plant species.
 * Returns the name of the most limiting nutrient.
 *
 * @param resources - Current resource state
 * @param waterVolume - Current water volume in liters
 * @param species - Plant species
 * @param config - Nutrients configuration
 * @returns Name of the limiting nutrient
 */
export function getLimitingNutrient(
  resources: Resources,
  waterVolume: number,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): 'nitrate' | 'phosphate' | 'potassium' | 'iron' {
  if (waterVolume <= 0) return 'nitrate';

  const speciesData = PLANT_SPECIES_DATA[species];
  const demand = getDemandMultiplier(speciesData.nutrientDemand, config);

  const nitratePpm = getPpm(resources.nitrate, waterVolume);
  const phosphatePpm = getPpm(resources.phosphate, waterVolume);
  const potassiumPpm = getPpm(resources.potassium, waterVolume);
  const ironPpm = getPpm(resources.iron, waterVolume);

  const requiredNitrate = config.optimalNitratePpm * demand;
  const requiredPhosphate = config.optimalPhosphatePpm * demand;
  const requiredPotassium = config.optimalPotassiumPpm * demand;
  const requiredIron = config.optimalIronPpm * demand;

  const factors: Array<{ nutrient: 'nitrate' | 'phosphate' | 'potassium' | 'iron'; factor: number }> = [
    { nutrient: 'nitrate', factor: requiredNitrate > 0 ? nitratePpm / requiredNitrate : Infinity },
    { nutrient: 'phosphate', factor: requiredPhosphate > 0 ? phosphatePpm / requiredPhosphate : Infinity },
    { nutrient: 'potassium', factor: requiredPotassium > 0 ? potassiumPpm / requiredPotassium : Infinity },
    { nutrient: 'iron', factor: requiredIron > 0 ? ironPpm / requiredIron : Infinity },
  ];

  // Find the nutrient with the lowest factor (most limiting)
  return factors.reduce((min, curr) => (curr.factor < min.factor ? curr : min)).nutrient;
}
