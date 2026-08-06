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
 *
 * Both NH3 streams are deamination, and deamination is metabolism: each is
 * scaled by the same oxygen factor as the respiratory draw, off the same
 * `respirationOxygenHalfSaturation`. A hypoxic fish enters metabolic
 * depression and its measured ammonia output falls with the rest of it. Feces
 * are not scaled — that N is what was never absorbed, and the gut does not
 * care what the gills are getting.
 *
 * The N a depressed fish does not deaminate stays in its body, which is a sink
 * the engine does not track — the same standing the conservation test gives
 * plant uptake. Both rates are quoted as bands rather than as single figures
 * (0.3–1.0 mg NH3-N/g/day, 0.2–0.5 mg O2/g/hr), so neither is divided back up
 * by the factor the way the nitrifier rates are; what a healthy tank
 * reproduces is 89 % of each, and both land inside their band.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { N_TO_NH3_MASS_RATIO, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';

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

  const oxygenFactor = monodFactor(oxygen, config.respirationOxygenHalfSaturation);

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

    // Nitrogen split: deaminated gill NH3 vs. feces-bound waste.
    // nIngested (g N) = foodGiven × foodNitrogenFraction
    // nToGills (g N)  = nIngested × gillNFraction
    // directNH3 (mg)  = nToGills × MW_NH3/MW_N × 1000 × oxygenFactor
    // wasteMass (g)   = nToFeces / foodNitrogenFraction
    //                 = foodGiven × (1 − gillNFraction)
    const nIngested = foodGiven * config.foodNitrogenFraction;
    const nToGills = nIngested * config.gillNFraction;
    totalWaste += foodGiven * (1 - config.gillNFraction);

    // Basal NH3 excretion — independent of feeding. Body protein
    // turnover continues whether fed or fasted; real tetras keep
    // excreting a few tenths of a mg of NH3 per gram per day.
    const basalNH3 = config.basalAmmoniaRate * f.mass;

    // Both streams are deamination, and deamination is metabolism: the same
    // factor the draw below runs on, because it is the same metabolism.
    totalAmmonia += (nToGills * NH3_MG_PER_G_N + basalNH3) * oxygenFactor;

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
    oxygenConsumedMg: totalOxygenConsumedMg,
    co2ProducedMg: totalCo2ProducedMg,
  };
}
