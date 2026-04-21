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
 * nitrogenous waste as NH3/NH4⁺ directly through the gills. Output
 * has two additive components:
 *
 *  1. **Post-prandial** — driven by food intake. For every gram of
 *     food ingested we treat `foodNitrogenFraction` (default 5 %) as
 *     N. Of that N, `gillNFraction` (default 80 %) is emitted this
 *     tick as NH3; the remaining 20 % is bound in feces and leaves
 *     via the waste pool, where the existing decay + nitrogen-cycle
 *     pipeline mineralises it to NH3 at the engine's canonical
 *     `wasteToAmmoniaRatio` (60 mg NH3 / g waste, which encodes the
 *     same 5 % N content). That keeps N-mass conserved end-to-end.
 *
 *  2. **Basal** — produced continuously from body protein turnover
 *     regardless of feeding, at `basalAmmoniaRate` mg NH3 / g fish /
 *     hr. Real freshwater teleosts never stop excreting NH3: even a
 *     fasted fish keeps dumping ammonia while muscle catabolism
 *     continues. Without this term the engine would report zero NH3
 *     output whenever food runs out, which is unphysical and
 *     materially under-counts short-term ammonia accumulation in
 *     lean-fed tanks.
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
  /** Total oxygen consumed (mg, absolute — caller divides by water volume for mg/L delta) */
  oxygenConsumedMg: number;
  /** Total CO2 produced (mg, absolute — caller divides by water volume for mg/L delta) */
  co2ProducedMg: number;
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
      oxygenConsumedMg: 0,
      co2ProducedMg: 0,
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
  let totalOxygenConsumedMg = 0;
  let totalCo2ProducedMg = 0;

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

    // Basal NH3 excretion — independent of feeding. Body protein
    // turnover continues whether fed or fasted; real tetras keep
    // excreting a few tenths of a mg of NH3 per gram per day.
    totalAmmonia += config.basalAmmoniaRate * f.mass;

    // Respiration: absolute mg O2 consumed and CO2 produced based on mass.
    // `baseRespirationRate` is mg O2 per gram fish per hour — an intrinsic
    // physiological rate, independent of tank volume. The caller converts
    // the returned absolute mass into a mg/L concentration delta using the
    // current water volume.
    const oxygenConsumedMg = config.baseRespirationRate * f.mass;
    totalOxygenConsumedMg += oxygenConsumedMg;
    totalCo2ProducedMg += oxygenConsumedMg * config.respiratoryQuotient;

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
    oxygenConsumedMg: totalOxygenConsumedMg,
    co2ProducedMg: totalCo2ProducedMg,
  };
}
