/**
 * Plant nutrition — how much of each nutrient a species needs, how much of
 * that need the tank's pools meet, and what new tissue takes out of them.
 *
 * A plant feeds on two pools: the water column and, through its roots, the
 * bed. Its growth form fixes the share it draws through its roots; every
 * nutrient saturates on its own Monod curve in each pool, at a half-saturation
 * scaled by the species' demand for it, and the plant's share of a nutrient is
 * the two pools' shares weighted by where it feeds. Sufficiency is the scarcest
 * of them (Liebig).
 *
 * Tissue is the organic matter it rots into, at food's recipe: growing draws
 * that recipe out of the pools, and shedding and death hand it back as waste,
 * so a plant holds its N, P, K and Fe and never makes or loses any.
 */

import type { Resources, SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
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

/** A stock plants feed on: mg of each nutrient, and the litres it reads against. */
export interface NutrientPool {
  stock: NutrientVector;
  volume: number;
}

/** The water column, then the bed — the order every per-pool list follows. */
export type TankPools = readonly [water: NutrientPool, bed: NutrientPool];

/**
 * The tank's two pools. The bed reads against the tank's capacity, the litres
 * every per-litre quantity of a bed scales with.
 */
export function tankPools(state: Pick<SimulationState, 'resources' | 'equipment' | 'tank'>): TankPools {
  return [
    { stock: state.resources, volume: state.resources.water },
    { stock: state.equipment.substrate.nutrients, volume: state.tank.capacity },
  ];
}

/** Share of the species' need for each nutrient that one pool meets, 0–1. */
export function nutrientShares(
  pool: NutrientPool,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return vector((n) => nutrientShare(getPpm(pool.stock[n], pool.volume), species, n, config));
}

/** A plant's draw on one pool: the share of its feeding done there, and the share of its need for each nutrient the pool meets. */
export interface PoolDraw {
  weight: number;
  shares: NutrientVector;
}

/** Where a species feeds: its roots' share from the bed, the rest from the water. */
export function poolDraws(
  [water, bed]: TankPools,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): PoolDraw[] {
  const roots = growthFormOf(species).rootShare;
  return [
    { weight: 1 - roots, shares: nutrientShares(water, species, config) },
    { weight: roots, shares: nutrientShares(bed, species, config) },
  ];
}

/** Share of a plant's need for each nutrient its pools meet together, 0–1. */
export function plantShares(draws: readonly PoolDraw[]): NutrientVector {
  return vector((n) => draws.reduce((sum, { weight, shares }) => sum + weight * shares[n], 0));
}

/** Liebig sufficiency: the scarcest nutrient's share, 0–1. */
export function liebig(shares: NutrientVector): number {
  return Math.min(...NUTRIENTS.map((n) => shares[n]));
}

export function calculateNutrientSufficiency(
  pools: TankPools,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return liebig(plantShares(poolDraws(pools, species, config)));
}

/** mg of each nutrient in a gram of organic matter — food, its waste and plant tissue alike. */
export function organicNutrients(livestock: LivestockConfig, nutrients: NutrientsConfig): NutrientVector {
  return { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent };
}

export interface TissueNeed {
  grams: number;
  /** Its draw on each pool, in the order of the pools. */
  draws: readonly PoolDraw[];
}

export interface TissueDraw {
  /** Share of each plant's tissue the pools supplied, 0–1, in the order of the needs. */
  supplied: number[];
  /** mg of each nutrient drawn from each pool, in the order of the pools. */
  drawn: NutrientVector[];
}

/**
 * New tissue takes its recipe out of the pools. Each plant requests its tissue
 * from each pool at the weight it feeds there and the share of its need the
 * pool meets, and each pool delivers through `monodUptake`: the tissue its
 * feeders would take there at full supply, against the half-saturation at
 * which one consumer would request at the start of the tick what they request.
 * Every request on a pool is met at the fraction it delivered; a plant's
 * supply of a nutrient is what its pools met of it together, it is supplied
 * the scarcest, and what it takes splits between the pools as they met it.
 * So a lean species holds on where a hungry one starves, an ordinary hour
 * meets every request in full, and no pool is ever overdrawn.
 */
export function drawTissue(
  needs: readonly TissueNeed[],
  pools: readonly NutrientPool[],
  recipe: NutrientVector
): TissueDraw {
  const met = pools.map((pool, p) =>
    metFractions(
      needs.map(({ grams, draws }) => ({ grams, ...draws[p] })),
      pool.stock,
      recipe
    )
  );
  const reached = needs.map(({ draws }) =>
    draws.map(({ weight, shares }, p) => ({ weight, shares: vector((n) => shares[n] * met[p][n]) }))
  );
  const supply = reached.map(plantShares);
  const supplied = supply.map((share) => Math.min(...NUTRIENTS.map((n) => (recipe[n] > 0 ? share[n] : 1))));

  const drawn = pools.map((_, p) =>
    vector((n) =>
      needs.reduce((sum, { grams }, i) => {
        const reach = reached[i][p].weight * reached[i][p].shares[n];
        return reach > 0 ? sum + grams * supplied[i] * recipe[n] * (reach / supply[i][n]) : sum;
      }, 0)
    )
  );
  return { supplied, drawn };
}

/**
 * mg of GH, as CaCO3, new tissue takes out of the water beside the nitrate it
 * drew: on its own Monod, and never a limit on growth.
 */
export function ghDrawn(nitrate: number, water: Pick<Resources, 'gh' | 'water'>): number {
  return monodUptake(
    water.gh,
    nitrate * GH_PER_NITRATE_DRAWN,
    getMassFromPpm(GH_HALF_SATURATION, water.water)
  );
}

/** Share of what its feeders request of each nutrient that one pool delivers this tick, 0–1. */
function metFractions(
  requests: readonly (PoolDraw & { grams: number })[],
  stock: NutrientVector,
  recipe: NutrientVector
): NutrientVector {
  const grams = requests.reduce((sum, r) => sum + r.grams * r.weight, 0);
  return vector((n) => {
    const requested = requests.reduce((sum, r) => sum + r.grams * r.weight * r.shares[n], 0);
    if (requested <= 0 || recipe[n] <= 0) return 0;
    const delivered = monodUptake(stock[n], grams * recipe[n], stock[n] * (grams / requested - 1));
    return delivered / (requested * recipe[n]);
  });
}

function vector(value: (n: Nutrient) => number): NutrientVector {
  return Object.fromEntries(NUTRIENTS.map((n) => [n, value(n)])) as NutrientVector;
}
