/**
 * Fish metabolism: each hour every gut digests, every fish eats its share of
 * the food, and every fish breathes.
 *
 * Nitrogen accounting
 * -------------------
 * Aquarium fish are ammoniotelic, and the only nitrogen a fish releases is
 * nitrogen it digested. Food in the gut still holds all of its nitrogen, so a
 * meal's ammonia and waste come out over the hours it digests. Of every gram
 * digested, `gillNFraction` of its nitrogen leaves through the gills as NH3,
 * with the minerals of that share beside it; the rest is feces, which carry
 * the food's own nitrogen and mineral fractions into the waste pool:
 *     wasteMass = digested × (1 − gillNFraction)
 *
 * Deamination rides digestion, and digestion rides the metabolic factor —
 * the metabolic Q10 times the oxygen factor respiration runs on — so a
 * hypoxic fish digests, deaminates and breathes less together, and a cold one
 * digests slower.
 */

import type { Fish, Resources } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { N_TO_NH3_MASS_RATIO, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { WASTE_NUTRIENTS, nutrientsDefaults, type MineralVector } from '../config/nutrients.js';
import { appetite, digest, serve } from './digestion.js';

const NH3_MG_PER_G_N = N_TO_NH3_MASS_RATIO * 1000;

export interface Excretion {
  /** Grams of feces. */
  waste: number;
  /** mg of NH3 through the gills. */
  ammonia: number;
  /** mg of each mineral beside the gill NH3. */
  minerals: MineralVector;
}

/** What `digested` grams of food leave in the water. */
export function excretion(
  digested: number,
  config: LivestockConfig,
  foodMineralContent: MineralVector = nutrientsDefaults.foodMineralContent
): Excretion {
  const absorbed = digested * config.gillNFraction;
  return {
    waste: digested - absorbed,
    ammonia: absorbed * config.foodNitrogenFraction * NH3_MG_PER_G_N,
    minerals: Object.fromEntries(
      WASTE_NUTRIENTS.map((n) => [n, absorbed * foodMineralContent[n]])
    ) as MineralVector,
  };
}

export interface MetabolismResult {
  /** Every fish with its gut and age moved on, in the order handed in. */
  updatedFish: Fish[];
  /** Grams each fish digested this hour, in the order handed in. */
  digested: number[];
  /** Pace every fish's digestion and maintenance ran at this hour against reference water. */
  metabolicFactor: number;
  /** Grams of food eaten from the tank. */
  foodConsumed: number;
  /** Grams of feces. */
  wasteProduced: number;
  /** mg of NH3 through the gills. */
  ammoniaProduced: number;
  /** mg of each mineral beside the gill NH3. */
  mineralsExcreted: MineralVector;
  /** mg of O2 drawn — the caller divides by water volume. */
  oxygenConsumedMg: number;
  /** mg of CO2 exhaled — the caller divides by water volume. */
  co2ProducedMg: number;
}

export type MetabolismWater = Pick<Resources, 'food' | 'oxygen' | 'temperature'>;

/**
 * One hour of metabolism. Each gut digests what it held coming into the hour;
 * then every fish eats at once, each taking its appetite in full, or the same
 * share of it as every other fish when there is not enough food to go round.
 */
export function processMetabolism(
  fish: Fish[],
  water: MetabolismWater,
  config: LivestockConfig,
  foodMineralContent: MineralVector = nutrientsDefaults.foodMineralContent
): MetabolismResult {
  const oxygenFactor = monodFactor(water.oxygen, config.respirationOxygenHalfSaturation);
  const metabolicFactor =
    q10Factor(water.temperature, config.metabolicQ10, config.metabolicReferenceTemp) * oxygenFactor;

  const digested = fish.map((f) => digest(f.gut, metabolicFactor, config));
  const digestedFish = fish.map((f, i) => ({ ...f, gut: Math.max(0, f.gut - digested[i]) }));
  const eaten = serve(
    digestedFish.map((f) => appetite(f, config)),
    water.food
  );
  const updatedFish = digestedFish.map((f, i) => ({ ...f, gut: f.gut + eaten[i], age: f.age + 1 }));

  const totalDigested = digested.reduce((sum, d) => sum + d, 0);
  const out = excretion(totalDigested, config, foodMineralContent);
  const oxygenConsumedMg = fish.reduce((sum, f) => sum + config.baseRespirationRate * f.mass, 0) * oxygenFactor;

  return {
    updatedFish,
    digested,
    metabolicFactor,
    foodConsumed: eaten.reduce((sum, e) => sum + e, 0),
    wasteProduced: out.waste,
    ammoniaProduced: out.ammonia,
    mineralsExcreted: out.minerals,
    oxygenConsumedMg,
    co2ProducedMg: oxygenConsumedMg * config.respiratoryQuotient * O2_TO_CO2_MASS_RATIO,
  };
}
