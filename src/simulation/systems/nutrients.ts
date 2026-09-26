/**
 * Plant nutrition — how much of each nutrient a species needs, how much of
 * that need the water column meets, and what new tissue takes out of it.
 *
 * Every nutrient saturates on its own Monod curve, at a half-saturation scaled
 * by the species' demand for it; sufficiency is the scarcest of them (Liebig).
 *
 * Tissue is the organic matter it rots into, at food's recipe: growing draws
 * that recipe out of the water, and shedding and death hand it back as waste,
 * so a plant holds its N, P, K and Fe and never makes or loses any.
 */

import type { Resources } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import {
  NUTRIENTS,
  nutrientsDefaults,
  type Nutrient,
  type NutrientsConfig,
  type NutrientVector,
} from '../config/nutrients.js';
import { monodFactor, monodUptake } from '../core/kinetics.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';
import { nitratePerGramOfFood, type LivestockConfig } from '../config/livestock.js';

/**
 * mg of GH, as CaCO3, a plant takes up per mg of nitrate it draws. Leaf
 * tissue carries about a third as much calcium and a tenth as much magnesium
 * as nitrogen; converted to CaCO3 equivalents per mg of NO3, that is ~0.28.
 */
export const GH_PER_NITRATE_DRAWN = 0.28;

/** ppm of GH, as CaCO3, at which plants take calcium and magnesium at half their need. */
export const GH_HALF_SATURATION = 1;

/** Share of a full-demand plant's need this species has, per nutrient. */
export function speciesDemand(
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return config.demand[PLANT_SPECIES_DATA[species].nutrientDemand];
}

/** ppm at which this species runs at half on the nutrient. */
export function speciesHalfSaturation(
  species: PlantSpecies,
  nutrient: Nutrient,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return speciesDemand(species, config)[nutrient] * config.halfSaturation[nutrient];
}

/** Share of the species' need for one nutrient that this ppm meets, 0–1. */
export function nutrientShare(
  ppm: number,
  species: PlantSpecies,
  nutrient: Nutrient,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return monodFactor(ppm, speciesHalfSaturation(species, nutrient, config));
}

/** Share of the species' need for each nutrient that the water meets, 0–1. */
export function nutrientShares(
  resources: Resources,
  waterVolume: number,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return Object.fromEntries(
    NUTRIENTS.map((n) => [
      n,
      waterVolume > 0 ? nutrientShare(getPpm(resources[n], waterVolume), species, n, config) : 0,
    ])
  ) as NutrientVector;
}

/** Liebig sufficiency: the scarcest nutrient's share, 0–1. */
export function liebig(shares: NutrientVector): number {
  return Math.min(...NUTRIENTS.map((n) => shares[n]));
}

export function calculateNutrientSufficiency(
  resources: Resources,
  waterVolume: number,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return liebig(nutrientShares(resources, waterVolume, species, config));
}

/** mg of each nutrient in a gram of organic matter — food, its waste and plant tissue alike. */
export function organicNutrients(livestock: LivestockConfig, nutrients: NutrientsConfig): NutrientVector {
  return { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent };
}

export interface TissueNeed {
  grams: number;
  shares: NutrientVector;
}

export interface TissueDraw {
  /** Share of each plant's tissue the water supplied, 0–1, in the order of the needs. */
  supplied: number[];
  /** mg of each nutrient drawn, and of GH as CaCO3. */
  drawn: NutrientVector & { gh: number };
}

/**
 * New tissue takes its recipe out of the water. Each plant requests its tissue
 * at its own share of each nutrient, and each pool delivers through
 * `monodUptake`, as CO₂ does to photosynthesis: the planting's tissue at full
 * supply, against the half-saturation at which one consumer would request at
 * the start of the tick what the planting requests. Every request on a pool is
 * met at the fraction it delivered, and a plant is supplied the scarcest of its
 * met requests. So a lean species holds on where a hungry one starves, an
 * ordinary hour meets every request in full, and no pool is ever overdrawn —
 * an offshoot's lump included.
 *
 * Calcium and magnesium ride the nitrate actually drawn, on their own Monod,
 * and never limit growth.
 */
export function drawTissue(
  needs: readonly TissueNeed[],
  water: Pick<Resources, Nutrient | 'gh' | 'water'>,
  recipe: NutrientVector
): TissueDraw {
  const volume = water.water;
  const drawn = { ...zeroVector(), gh: 0 };
  if (volume <= 0) return { supplied: needs.map(() => 0), drawn };

  const met = NUTRIENTS.filter((n) => recipe[n] > 0).map(
    (n) => [n, metFraction(needs, n, water[n], recipe[n])] as const
  );
  const supplied = needs.map(({ shares }) => Math.min(1, ...met.map(([n, fraction]) => shares[n] * fraction)));

  const grams = needs.reduce((sum, need, i) => sum + need.grams * supplied[i], 0);
  for (const n of NUTRIENTS) drawn[n] = grams * recipe[n];
  drawn.gh = monodUptake(
    water.gh,
    drawn.nitrate * GH_PER_NITRATE_DRAWN,
    getMassFromPpm(GH_HALF_SATURATION, volume)
  );

  return { supplied, drawn };
}

/** Share of the planting's requests on one pool that the pool delivers this tick, 0–1. */
function metFraction(needs: readonly TissueNeed[], nutrient: Nutrient, stock: number, perGram: number): number {
  let grams = 0;
  let requested = 0;
  for (const need of needs) {
    grams += need.grams;
    requested += need.grams * need.shares[nutrient];
  }
  if (requested <= 0) return 1;
  const delivered = monodUptake(stock, grams * perGram, stock * (grams / requested - 1));
  return delivered / (requested * perGram);
}

function zeroVector(): NutrientVector {
  return Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as NutrientVector;
}
