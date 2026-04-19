/**
 * Fish metabolism system.
 *
 * Handles:
 * - Food consumption (reduces tank food, reduces fish hunger)
 * - Nitrogen excretion: direct gill NH3 + feces-bound waste
 * - Oxygen consumption (reduces dissolved O2)
 * - CO2 production (adds dissolved CO2)
 * - Hunger increase over time
 * - Age increase
 *
 * Nitrogen accounting
 * -------------------
 * Aquarium fish are ammoniotelic — they excrete most of their
 * nitrogenous waste as NH3/NH4⁺ directly through the gills. For every
 * gram of food ingested we treat `foodNitrogenFraction` (default 5 %)
 * as N. Of that N, `gillNFraction` (default 80 %) is emitted this tick
 * as NH3 into the water column; the remaining 20 % is bound in feces
 * and leaves via the waste pool, where the existing decay + nitrogen-
 * cycle pipeline mineralises it to NH3 at the engine's canonical
 * `wasteToAmmoniaRatio` (60 mg NH3 / g waste, which encodes the same
 * 5 % N content). That keeps N-mass conserved end-to-end.
 *
 * The waste mass from a fish is therefore not a free parameter:
 *     wasteMass = (N to feces) / foodNitrogenFraction
 *               = foodGiven × (1 - gillNFraction)
 * At defaults this is 0.2 g waste per g food, replacing the previous
 * opaque `wasteRatio = 0.3` knob.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { MW_N, MW_NH3 } from './nitrogen-cycle.js';

/** mg NH3 emitted per g of elemental N (MW_NH3 / MW_N × 1000). */
const NH3_MG_PER_G_N = (MW_NH3 / MW_N) * 1000;

export interface MetabolismResult {
  /** Updated fish array (with new hunger, age values) */
  updatedFish: Fish[];
  /** Total food consumed from tank (grams) */
  foodConsumed: number;
  /** Total waste produced (grams) */
  wasteProduced: number;
  /** Direct NH3 excreted through gills (mg compound mass) */
  ammoniaProduced: number;
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
      ammoniaProduced: 0,
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
  let totalAmmonia = 0;
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

    // Nitrogen split: direct gill NH3 vs. feces-bound waste.
    // nIngested (g N) = foodGiven × foodNitrogenFraction
    // nToGills (g N)  = nIngested × gillNFraction
    // directNH3 (mg)  = nToGills × MW_NH3/MW_N × 1000
    // wasteMass (g)   = nToFeces / foodNitrogenFraction
    //                 = foodGiven × (1 − gillNFraction)
    const nIngested = foodGiven * config.foodNitrogenFraction;
    const nToGills = nIngested * config.gillNFraction;
    totalAmmonia += nToGills * NH3_MG_PER_G_N;
    totalWaste += foodGiven * (1 - config.gillNFraction);

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
    ammoniaProduced: totalAmmonia,
    oxygenDelta: totalOxygenDelta,
    co2Delta: totalCo2Delta,
  };
}
