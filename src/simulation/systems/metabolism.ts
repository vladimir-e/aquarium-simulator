/**
 * Fish metabolism system.
 *
 * Handles:
 * - Food consumption (reduces tank food, reduces fish hunger)
 * - Waste production (adds to tank waste)
 * - Oxygen consumption (reduces dissolved O2)
 * - CO2 production (adds dissolved CO2)
 * - Hunger increase over time
 * - Age increase
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';

export interface MetabolismResult {
  /** Updated fish array (with new hunger, age values) */
  updatedFish: Fish[];
  /** Total food consumed from tank (grams) */
  foodConsumed: number;
  /** Total waste produced (grams) */
  wasteProduced: number;
  /** Change in dissolved oxygen (mg/L, negative = consumed) */
  oxygenDelta: number;
  /** Change in dissolved CO2 (mg/L, positive = produced) */
  co2Delta: number;
}

/**
 * Process metabolism for all fish in one tick.
 *
 * Fish are sorted by hunger (highest first) for food priority.
 * Each fish consumes food proportional to its mass and hunger level.
 */
export function processMetabolism(
  fish: Fish[],
  availableFood: number,
  config: LivestockConfig
): MetabolismResult {
  if (fish.length === 0) {
    return {
      updatedFish: [],
      foodConsumed: 0,
      wasteProduced: 0,
      oxygenDelta: 0,
      co2Delta: 0,
    };
  }

  // Sort by hunger (highest first) for feeding priority
  const sortedIndices = fish
    .map((_, i) => i)
    .sort((a, b) => fish[b].hunger - fish[a].hunger);

  let remainingFood = availableFood;
  let totalFoodConsumed = 0;
  let totalWaste = 0;
  let totalOxygenDelta = 0;
  let totalCo2Delta = 0;

  const updatedFish: Fish[] = [...fish];

  for (const idx of sortedIndices) {
    const f = fish[idx];

    // Calculate food needed based on hunger and mass
    const foodNeeded = (f.hunger / 100) * f.mass * config.baseFoodRate;
    const foodGiven = Math.min(foodNeeded, remainingFood);
    remainingFood -= foodGiven;
    totalFoodConsumed += foodGiven;

    // Calculate hunger reduction from food eaten
    // If we give all food needed, hunger drops proportionally
    let hungerReduction = 0;
    if (foodNeeded > 0) {
      hungerReduction = (foodGiven / foodNeeded) * f.hunger;
    }

    // Hunger increases over time
    const hungerIncrease = config.hungerIncreaseRate;
    const newHunger = Math.min(100, Math.max(0, f.hunger - hungerReduction + hungerIncrease));

    // Waste production from food consumed
    totalWaste += foodGiven * config.wasteRatio;

    // Respiration: oxygen consumed and CO2 produced based on mass
    const oxygenConsumed = config.baseRespirationRate * f.mass;
    totalOxygenDelta -= oxygenConsumed;
    totalCo2Delta += oxygenConsumed * config.respiratoryQuotient;

    // Age increase (1 tick = 1 hour)
    updatedFish[idx] = {
      ...f,
      hunger: newHunger,
      age: f.age + 1,
    };
  }

  return {
    updatedFish,
    foodConsumed: totalFoodConsumed,
    wasteProduced: totalWaste,
    oxygenDelta: totalOxygenDelta,
    co2Delta: totalCo2Delta,
  };
}
