/**
 * Fish metabolism: each hour every gut digests, every fish eats its share of
 * the food, and every fish breathes.
 *
 * Nitrogen accounting
 * -------------------
 * Aquarium fish are ammoniotelic, and the only nitrogen a fish releases is
 * nitrogen it digested. Food in the gut still holds all of its nitrogen, so a
 * meal's ammonia and waste come out over the hours it digests. Of every gram
 * digested, `assimilatedFraction` is assimilated and the rest is feces, which
 * carry the food's own nitrogen and mineral fractions into the waste pool. What a
 * growing fish builds into its body comes out of the assimilated share; the
 * rest leaves through the gills as NH3, with its minerals beside it:
 *     wasteMass = digested × (1 − assimilatedFraction)
 *     gill      = digested × assimilatedFraction − retained
 *
 * Deamination rides digestion, and digestion and respiration both ride the
 * metabolic factor — the metabolic Q10 times the oxygen factor — so a hypoxic
 * fish digests, deaminates and breathes less together, a cold one slower, and
 * a warm one faster.
 */

import type { Fish, Resources } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { N_TO_NH3_MASS_RATIO, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { WASTE_NUTRIENTS, nutrientsDefaults, type MineralVector } from '../config/nutrients.js';
import { sum } from '../core/sum.js';
import { appetite, digest, shareCapped } from './digestion.js';

const NH3_MG_PER_G_N = N_TO_NH3_MASS_RATIO * 1000;

export interface Excretion {
  /** Grams of feces. */
  waste: number;
  /** mg of NH3 through the gills. */
  ammonia: number;
  /** mg of each mineral beside the gill NH3. */
  minerals: MineralVector;
}

/** Grams of `digested` food a fish takes into its body. */
export function assimilated(digested: number, config: LivestockConfig): number {
  return digested * config.assimilatedFraction;
}

/** What `digested` grams of food leave in the water once `retained` grams of them are built into bodies. */
export function excretion(
  digested: number,
  retained: number,
  config: LivestockConfig,
  foodMineralContent: MineralVector = nutrientsDefaults.foodMineralContent
): Excretion {
  const absorbed = Math.max(0, assimilated(digested, config) - retained);
  return {
    waste: digested - assimilated(digested, config),
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
  /** mg of O2 drawn — the caller divides by water volume. */
  oxygenConsumedMg: number;
  /** mg of CO2 exhaled — the caller divides by water volume. */
  co2ProducedMg: number;
}

export type MetabolismWater = Pick<Resources, 'food' | 'oxygen' | 'temperature'>;

/** Share of its full rate a fish breathes at in this much oxygen. */
export function oxygenFactor(oxygen: number, config: LivestockConfig): number {
  return monodFactor(oxygen, config.respirationOxygenHalfSaturation);
}

/** The pace every fish digests, needs and breathes at in this water, against reference water. */
export function metabolicFactorOf(water: Pick<Resources, 'oxygen' | 'temperature'>, config: LivestockConfig): number {
  return (
    q10Factor(water.temperature, config.metabolicQ10, config.metabolicReferenceTemp) *
    oxygenFactor(water.oxygen, config)
  );
}

/**
 * One hour of metabolism. Each gut digests what it held coming into the hour;
 * then every fish eats at once, each taking its appetite in full, or the same
 * share of it as every other fish when there is not enough food to go round.
 */
export function processMetabolism(fish: Fish[], water: MetabolismWater, config: LivestockConfig): MetabolismResult {
  const factor = metabolicFactorOf(water, config);

  const digested = fish.map((f) => digest(f.gut, factor, config));
  const digestedFish = fish.map((f, i) => ({ ...f, gut: Math.max(0, f.gut - digested[i]) }));
  const appetites = digestedFish.map((f) => appetite(f, config));
  const eaten = shareCapped(appetites, appetites, water.food).taken;
  const updatedFish = digestedFish.map((f, i) => ({ ...f, gut: f.gut + eaten[i], age: f.age + 1 }));

  const oxygenConsumedMg = config.baseRespirationRate * sum(fish.map((f) => f.mass)) * factor;

  return {
    updatedFish,
    digested,
    metabolicFactor: factor,
    foodConsumed: sum(eaten),
    oxygenConsumedMg,
    co2ProducedMg: oxygenConsumedMg * config.respiratoryQuotient * O2_TO_CO2_MASS_RATIO,
  };
}
