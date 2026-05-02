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
  /** Updated fish array (with new satiation, age values) */
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

  // Sort by satiation (lowest first — hungriest fish served first).
  const sortedIndices = fish
    .map((_, i) => i)
    .sort((a, b) => fish[a].satiation - fish[b].satiation);

  let remainingFood = availableFood;
  let totalFoodConsumed = 0;
  let totalWaste = 0;
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
      satiation: newSatiation,
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
