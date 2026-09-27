/**
 * Nutrition — how much of each nutrient a feeder needs, how much of that need
 * the tank's pools meet, and what new tissue takes out of them. Plants and
 * algae feed the same way.
 *
 * A feeder draws on two pools: the water column and, through roots, the bed. A
 * plant's growth form fixes the share it draws through its roots, and algae
 * has none; every nutrient saturates on its own Monod curve in each pool, at a
 * half-saturation scaled by the feeder's demand for it, and its share of a
 * nutrient is the two pools' shares weighted by where it feeds. Sufficiency is
 * the scarcest of them (Liebig).
 *
 * Tissue is the organic matter it rots into, at food's recipe: growing draws
 * that recipe out of the pools, and shedding and death hand it back as waste,
 * so a plant or a bloom holds its N, P, K and Fe and never makes or loses any.
 */

import type { Resources, SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import {
  mapNutrients,
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

/** ppm at which a feeder of this demand runs at half on the nutrient. */
function halfSaturationAt(demand: NutrientVector, nutrient: Nutrient, config: NutrientsConfig): number {
  return demand[nutrient] * config.halfSaturation[nutrient];
}

/** ppm at which this species runs at half on the nutrient. */
export function speciesHalfSaturation(
  species: PlantSpecies,
  nutrient: Nutrient,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return halfSaturationAt(speciesDemand(species, config), nutrient, config);
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

/** A stock feeders draw on: mg of each nutrient, and the litres it reads against. */
export interface NutrientPool {
  stock: NutrientVector;
  volume: number;
}

/** The water column, then the bed. */
export type TankPools = readonly [water: NutrientPool, bed: NutrientPool];

/** One entry per pool, in the pools' order. */
export type PerPool<P extends readonly NutrientPool[], T> = { readonly [K in keyof P]: T };

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

/** What feeds on the pools: its demand for each nutrient, and the share of its feeding done through roots. */
export interface Feeder {
  demand: NutrientVector;
  rootShare: number;
}

export function plantFeeder(species: PlantSpecies, config: NutrientsConfig = nutrientsDefaults): Feeder {
  return { demand: speciesDemand(species, config), rootShare: growthFormOf(species).rootShare };
}

/** Share of a feeder's need for each nutrient that one pool meets, 0–1. */
export function nutrientShares(
  pool: NutrientPool,
  demand: NutrientVector,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return mapNutrients((n) =>
    monodFactor(getPpm(pool.stock[n], pool.volume), halfSaturationAt(demand, n, config))
  );
}

/** A feeder's draw on one pool: the share of its feeding done there, and the share of its need for each nutrient the pool meets. */
export interface PoolDraw {
  weight: number;
  shares: NutrientVector;
}

/** Where a feeder feeds: its roots' share from the bed, the rest from the water. A dry tank feeds nothing. */
export function poolDraws(
  [water, bed]: TankPools,
  feeder: Feeder,
  config: NutrientsConfig = nutrientsDefaults
): PerPool<TankPools, PoolDraw> {
  const wet = water.volume > 0 ? 1 : 0;
  return [
    { weight: wet * (1 - feeder.rootShare), shares: nutrientShares(water, feeder.demand, config) },
    { weight: wet * feeder.rootShare, shares: nutrientShares(bed, feeder.demand, config) },
  ];
}

/** Share of a feeder's need for each nutrient its pools meet together, 0–1. */
export function feederShares(draws: readonly PoolDraw[]): NutrientVector {
  return mapNutrients((n) => draws.reduce((sum, { weight, shares }) => sum + weight * shares[n], 0));
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
  return liebig(feederShares(poolDraws(pools, plantFeeder(species, config), config)));
}

/** mg of each nutrient in a gram of organic matter — food, its waste, plant and algae tissue alike. */
export function organicNutrients(livestock: LivestockConfig, nutrients: NutrientsConfig): NutrientVector {
  return { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent };
}

export interface TissueNeed<P extends readonly NutrientPool[] = TankPools> {
  grams: number;
  draws: PerPool<P, PoolDraw>;
}

export interface TissueDraw<P extends readonly NutrientPool[] = TankPools> {
  /** Share of each feeder's tissue the pools supplied, 0–1, in the order of the needs. */
  supplied: number[];
  /** mg of each nutrient drawn from each pool. */
  drawn: PerPool<P, NutrientVector>;
}

/**
 * The share of each feeder's new tissue its pools supply, and what that tissue
 * takes out of each pool at the recipe. Each pool meets every request on it at
 * one fraction, through `monodUptake`, so no pool is ever overdrawn and no
 * feeder is served before another.
 */
export function drawTissue<P extends readonly NutrientPool[]>(
  needs: readonly TissueNeed<P>[],
  pools: P,
  recipe: NutrientVector
): TissueDraw<P> {
  const met = pools.map((pool, p) =>
    metFractions(
      needs.map(({ grams, draws }) => ({ grams, ...draws[p] })),
      pool.stock,
      recipe
    )
  );
  const reached = needs.map(({ draws }) =>
    draws.map(({ weight, shares }, p) => ({ weight, shares: mapNutrients((n) => shares[n] * met[p][n]) }))
  );
  const supply = reached.map(feederShares);
  const supplied = supply.map((share) => Math.min(...NUTRIENTS.map((n) => (recipe[n] > 0 ? share[n] : 1))));

  const drawn = pools.map((_, p) =>
    mapNutrients((n) =>
      needs.reduce((sum, { grams }, i) => {
        const reach = reached[i][p].weight * reached[i][p].shares[n];
        return reach > 0 ? sum + grams * supplied[i] * recipe[n] * (reach / supply[i][n]) : sum;
      }, 0)
    )
  ) as PerPool<P, NutrientVector>;
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
  return mapNutrients((n) => {
    const requested = requests.reduce((sum, r) => sum + r.grams * r.weight * r.shares[n], 0);
    if (requested <= 0 || recipe[n] <= 0) return 0;
    const delivered = monodUptake(stock[n], grams * recipe[n], stock[n] * (grams / requested - 1));
    return delivered / (requested * recipe[n]);
  });
}
