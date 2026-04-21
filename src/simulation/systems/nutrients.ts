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
import { nutrientsDefaults } from '../config/nutrients.js';
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

  // Per-demand-tier required-vs-boosting split (per `docs/6-PLANTS.md`):
  //   - Low  (Java Fern, Anubias):   NO3 required; PO4/K/Fe are boosters.
  //   - Med  (Amazon Sword):          NO3 + PO4 required; K/Fe are boosters.
  //   - High (Monte Carlo, Hairgrass): all four required (no shortcuts).
  //
  // A missing "required" nutrient caps sufficiency through Liebig's Law;
  // a missing "booster" has no effect on the Liebig floor (the plant keeps
  // running at the required-nutrient ceiling). Boosters can push sufficiency
  // back up to 1.0 when they're present — so a fully-fed low-demand plant
  // behaves exactly like before this refactor.
  const tier = speciesData.nutrientDemand;
  const nitrateRequired = true; // every tier needs N
  const phosphateRequired = tier === 'medium' || tier === 'high';
  const potassiumRequired = tier === 'high';
  const ironRequired = tier === 'high';

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

  // Per-nutrient factor. For "required" nutrients the factor applies Liebig
  // directly (limiting). For "booster" nutrients we treat "absent" as 1.0 —
  // the plant doesn't mind — but "present" still pins to optimal so
  // excesses don't stack beyond 1.0.
  const factorFor = (
    ppm: number,
    required: number,
    isRequired: boolean
  ): number => {
    if (required <= 0) return 1;
    if (!isRequired) return 1; // booster: absence is fine
    return Math.min(1, ppm / required);
  };

  const factors = [
    factorFor(nitratePpm, requiredNitrate, nitrateRequired),
    factorFor(phosphatePpm, requiredPhosphate, phosphateRequired),
    factorFor(potassiumPpm, requiredPotassium, potassiumRequired),
    factorFor(ironPpm, requiredIron, ironRequired),
  ];

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
/**
 * Target condition (the "steady-state well-being") that a plant's condition
 * trends toward. Linear in sufficiency so boundary-crossing transients
 * stay continuous: a plant whose nutrients oscillate around a sufficiency
 * level doesn't whipsaw between disparate targets.
 *
 * This homeostatic model matches scenario 02's observation that Variant B
 * plants "hover at 60–70 % condition" — that's a natural steady state at
 * sufficiency ≈ 0.65, not a transient.
 */
export function conditionTargetFor(
  sufficiency: number,
  _config: NutrientsConfig = nutrientsDefaults
): number {
  // Clamp to [0, 1] then scale.
  const s = Math.max(0, Math.min(1, sufficiency));
  return s * 100;
}

export function updatePlantCondition(
  condition: number,
  sufficiency: number,
  config: NutrientsConfig = nutrientsDefaults
): number {
  const target = conditionTargetFor(sufficiency, config);
  const delta = target - condition;
  const stepRate =
    delta >= 0 ? config.conditionRecoveryRate : config.conditionDecayRate;
  // Move at most `stepRate` %/tick toward the target. Never overshoot.
  const step = Math.sign(delta) * Math.min(Math.abs(delta), stepRate);
  return Math.max(0, Math.min(100, condition + step));
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
