/**
 * Fish metabolism system.
 *
 * Handles:
 * - Food consumption (reduces tank food, raises fish satiation)
 * - Nitrogen excretion: direct gill NH3 + feces-bound waste
 * - Oxygen consumption (reduces dissolved O2)
 * - CO2 production (adds dissolved CO2)
 * - Satiation decay over time
 * - Age increase
 *
 * Nitrogen accounting
 * -------------------
 * Aquarium fish are ammoniotelic — they excrete most of their
 * nitrogenous waste as NH3/NH4⁺ directly through the gills, and the only
 * nitrogen they release is nitrogen they ate. For every gram of food
 * ingested we treat `foodNitrogenFraction` (default 5 %) as N. Of that N,
 * `gillNFraction` (default 80 %) is emitted this tick as NH3; the remaining
 * 20 % is bound in feces and leaves via the waste pool, which mineralises to
 * NH3 at the same `foodNitrogenFraction`. That keeps N-mass conserved
 * end-to-end, and a fish that eats nothing releases nothing.
 *
 * The waste mass from a fish is therefore not a free parameter:
 *     wasteMass = (N to feces) / foodNitrogenFraction
 *               = foodGiven × (1 - gillNFraction)
 * At defaults this is 0.2 g waste per g food.
 *
 * The absorbed share's minerals leave beside the gill NH3, at
 * `foodMineralContent` per gram. Mineral excretion is not deamination and is
 * not scaled by oxygen.
 *
 * Gill NH3 is deamination, and deamination is metabolism: it is scaled by
 * the same oxygen factor as the respiratory draw, off the same
 * `respirationOxygenHalfSaturation`. A hypoxic fish enters metabolic
 * depression and its measured ammonia output falls with the rest of it. Feces
 * are not scaled — that N is what was never absorbed, and the gut does not
 * care what the gills are getting.
 *
 * The N a depressed fish does not deaminate stays in its body, which is a sink
 * the engine does not track — the same standing the conservation test gives
 * plant uptake.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { N_TO_NH3_MASS_RATIO, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';
import {
  WASTE_NUTRIENTS,
  nutrientsDefaults,
  type MineralVector,
} from '../config/nutrients.js';

const NH3_MG_PER_G_N = N_TO_NH3_MASS_RATIO * 1000;

export interface MetabolismResult {
  /** Updated fish array (with new satiation, age values) */
  updatedFish: Fish[];
  /** Total food consumed from tank (grams) */
  foodConsumed: number;
  /** Total waste produced (grams) */
  wasteProduced: number;
  /** Direct NH3 excreted through gills (mg compound mass) */
  ammoniaProduced: number;
  /** Minerals excreted beside the gill NH3 (mg) */
  mineralsExcreted: MineralVector;
  /** Total oxygen consumed (mg, absolute — caller divides by water volume for mg/L delta) */
  oxygenConsumedMg: number;
  /** Total CO2 produced (mg, absolute — caller divides by water volume for mg/L delta) */
  co2ProducedMg: number;
}

/**
 * Process metabolism for all fish in one tick.
 *
 * Fish are sorted by satiation (lowest first — hungriest served first)
 * for feeding priority. Each fish consumes food proportional to its mass
 * and how empty its stomach is, until satiation reaches 100. There is no
 * voluntary stop at "full enough"; overfeeding is achievable through the
 * normal eating loop and is punished by the satiation-band stressor in
 * `fish-health.ts`.
 */
export function processMetabolism(
  fish: Fish[],
  availableFood: number,
  oxygen: number,
  config: LivestockConfig,
  foodMineralContent: MineralVector = nutrientsDefaults.foodMineralContent
): MetabolismResult {
  const oxygenFactor = monodFactor(oxygen, config.respirationOxygenHalfSaturation);

  // Sort by satiation (lowest first — hungriest fish served first).
  const sortedIndices = fish
    .map((_, i) => i)
    .sort((a, b) => fish[a].satiation - fish[b].satiation);

  let remainingFood = availableFood;
  let totalFoodConsumed = 0;
  let totalWaste = 0;
  let totalAbsorbed = 0;
  let totalAmmonia = 0;
  let totalOxygenConsumedMg = 0;
  let totalCo2ProducedMg = 0;

  const updatedFish: Fish[] = [...fish];

  for (const idx of sortedIndices) {
    const f = fish[idx];

    // Stomach capacity is the gap between current satiation and the 100
    // hard cap. Maximum food intake this tick is the same fraction of
    // mass × baseFoodRate the legacy model used, scaled by how empty the
    // stomach is — a fish at satiation 0 eats a full ration; at 50 it
    // eats half; at 100 it can't eat any more.
    const emptiness = (100 - f.satiation) / 100;
    const foodNeeded = emptiness * f.mass * config.baseFoodRate;
    const foodGiven = Math.min(foodNeeded, remainingFood);
    remainingFood -= foodGiven;
    totalFoodConsumed += foodGiven;

    // Satiation rises with food eaten (filling the gap to 100). When all
    // requested food is delivered, satiation lands exactly at 100.
    let satiationGain = 0;
    if (foodNeeded > 0) {
      satiationGain = (foodGiven / foodNeeded) * (100 - f.satiation);
    }

    // Satiation decays over time — fish digest and burn through stored
    // energy whether or not they're feeding.
    const satiationDecay = config.satiationDecayRate;
    const newSatiation = Math.min(
      100,
      Math.max(0, f.satiation + satiationGain - satiationDecay)
    );

    // Nitrogen split: deaminated gill NH3 vs. feces-bound waste.
    // nIngested (g N) = foodGiven × foodNitrogenFraction
    // nToGills (g N)  = nIngested × gillNFraction
    // directNH3 (mg)  = nToGills × MW_NH3/MW_N × 1000 × oxygenFactor
    // wasteMass (g)   = nToFeces / foodNitrogenFraction
    //                 = foodGiven × (1 − gillNFraction)
    const nIngested = foodGiven * config.foodNitrogenFraction;
    const nToGills = nIngested * config.gillNFraction;
    totalWaste += foodGiven * (1 - config.gillNFraction);
    totalAbsorbed += foodGiven * config.gillNFraction;
    totalAmmonia += nToGills * NH3_MG_PER_G_N * oxygenFactor;

    const oxygenConsumedMg = config.baseRespirationRate * f.mass * oxygenFactor;
    totalOxygenConsumedMg += oxygenConsumedMg;
    totalCo2ProducedMg += oxygenConsumedMg * config.respiratoryQuotient * O2_TO_CO2_MASS_RATIO;

    // Age increase (1 tick = 1 hour)
    updatedFish[idx] = {
      ...f,
      satiation: newSatiation,
      age: f.age + 1,
    };
  }

  return {
    updatedFish,
    foodConsumed: totalFoodConsumed,
    wasteProduced: totalWaste,
    ammoniaProduced: totalAmmonia,
    mineralsExcreted: Object.fromEntries(
      WASTE_NUTRIENTS.map((n) => [n, totalAbsorbed * foodMineralContent[n]])
    ) as MineralVector,
    oxygenConsumedMg: totalOxygenConsumedMg,
    co2ProducedMg: totalCo2ProducedMg,
  };
}
