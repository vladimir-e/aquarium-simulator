/**
 * Nutrition — how much of each nutrient a feeder needs, how much of that need
 * the tank's pools meet, and what new tissue takes out of them. Plants and
 * algae feed the same way.
 *
 * A feeder draws on two pools: the water column and, through roots, the bed. A
 * plant's growth form fixes the share it draws through its roots, and algae
 * has none. Every form a pool holds saturates on its own Monod curve, at the
 * feeder's own half-saturation for it. Nitrogen comes in two — ammonia, taken
 * first, and nitrate for what ammonia leaves unmet — so a nutrient's share in a
 * pool is what its forms meet between them, `1 − Π(1 − share)`. Its share of a
 * nutrient is the two pools' shares weighted by where it feeds, and
 * sufficiency is the scarcest of them (Liebig).
 *
 * Tissue is the organic matter it rots into, at food's recipe: growing draws
 * that recipe out of the pools, and shedding and death hand it back as waste,
 * so a plant or a bloom holds its N, P, K and Fe and never makes or loses any.
 */

import type { Resources, SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA, growthFormOf } from '../plants/species.js';
import {
  FORMS_OF,
  mapForms,
  mapNutrients,
  NUTRIENT_OF,
  NUTRIENTS,
  nutrientsDefaults,
  type FormVector,
  type NutrientForm,
  type NutrientsConfig,
  type NutrientVector,
} from '../config/nutrients.js';
import { NO3_TO_NH3_MASS_RATIO } from '../core/chemistry.js';
import { monodFactor, monodUptake } from '../core/kinetics.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';
import { nitratePerGramOfFood, type LivestockConfig } from '../config/livestock.js';

/**
 * mg of GH, as CaCO3, a plant takes up per mg of nitrogen its tissue takes,
 * counted as nitrate. Leaf tissue carries about a third as much calcium and a
 * tenth as much magnesium as nitrogen; converted to CaCO3 equivalents per mg
 * of NO3, that is ~0.28.
 */
export const GH_PER_NITRATE_DRAWN = 0.28;

/** ppm of GH, as CaCO3, at which plants take calcium and magnesium at half their need. */
export const GH_HALF_SATURATION = 1;

/** mg of each form that carries a mg of its nutrient as the recipe counts it: ammonia holds nitrate's nitrogen at their weights' ratio. */
const FORM_MASS: Readonly<FormVector> = {
  ammonia: NO3_TO_NH3_MASS_RATIO,
  nitrate: 1,
  phosphate: 1,
  potassium: 1,
  iron: 1,
};

/** Share of a full-demand plant's need this species has, per nutrient. */
export function speciesDemand(
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return config.demand[PLANT_SPECIES_DATA[species].nutrientDemand];
}

/** ppm at which a feeder of this demand takes each form at half its need for the nutrient the form carries. */
export function formHalfSaturations(
  demand: NutrientVector,
  config: NutrientsConfig = nutrientsDefaults
): FormVector {
  return mapForms((f) => demand[NUTRIENT_OF[f]] * config.halfSaturation[f]);
}

/** ppm at which this species takes the form at half its need. */
export function speciesHalfSaturation(
  species: PlantSpecies,
  form: NutrientForm,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return formHalfSaturations(speciesDemand(species, config), config)[form];
}

/** Share of the species' need for a form's nutrient that this ppm of the form alone meets, 0–1. */
export function nutrientShare(
  ppm: number,
  species: PlantSpecies,
  form: NutrientForm,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return monodFactor(ppm, speciesHalfSaturation(species, form, config));
}

/** A stock feeders draw on: mg of each form, and the litres it reads against. */
export interface NutrientPool {
  stock: FormVector;
  volume: number;
}

/** The water column, then the bed. */
export type TankPools = readonly [water: NutrientPool, bed: NutrientPool];

/** One entry per pool, in the pools' order. */
export type PerPool<P extends readonly NutrientPool[], T> = { readonly [K in keyof P]: T };

/** A bed as roots feed on it: its store read against the tank's capacity, its nitrogen all nitrate. */
export function bedPool(nutrients: NutrientVector, capacity: number): NutrientPool {
  return { stock: { ...nutrients, ammonia: 0 }, volume: capacity };
}

/**
 * The tank's two pools. The bed reads against the tank's capacity, the litres
 * every per-litre quantity of a bed scales with.
 */
export function tankPools(state: Pick<SimulationState, 'resources' | 'equipment' | 'tank'>): TankPools {
  return [
    { stock: state.resources, volume: state.resources.water },
    bedPool(state.equipment.substrate.nutrients, state.tank.capacity),
  ];
}

/** What feeds on the pools: where it takes each form at half its need, and the share of its feeding done through roots. */
export interface Feeder {
  halfSaturation: FormVector;
  rootShare: number;
}

export function plantFeeder(species: PlantSpecies, config: NutrientsConfig = nutrientsDefaults): Feeder {
  return {
    halfSaturation: formHalfSaturations(speciesDemand(species, config), config),
    rootShare: growthFormOf(species).rootShare,
  };
}

/** Share of a feeder's need for its nutrient that each form in one pool meets on its own, 0–1. */
export function formShares(pool: NutrientPool, feeder: Feeder): FormVector {
  return mapForms((f) => monodFactor(getPpm(pool.stock[f], pool.volume), feeder.halfSaturation[f]));
}

/** Share of each nutrient's need its forms meet between them, each taking what those before it left. */
export function formsMeet(shares: FormVector): NutrientVector {
  return mapNutrients((n) => 1 - FORMS_OF[n].reduce((unmet, f) => unmet * (1 - shares[f]), 1));
}

/** A feeder's draw on one pool: the share of its feeding done there, and the share each form there meets on its own. */
export interface PoolDraw {
  weight: number;
  shares: FormVector;
}

/** Where a feeder feeds: its roots' share from the bed, the rest from the water. A dry tank feeds nothing. */
export function poolDraws([water, bed]: TankPools, feeder: Feeder): PerPool<TankPools, PoolDraw> {
  const wet = water.volume > 0 ? 1 : 0;
  return [
    { weight: wet * (1 - feeder.rootShare), shares: formShares(water, feeder) },
    { weight: wet * feeder.rootShare, shares: formShares(bed, feeder) },
  ];
}

/** Share of a feeder's need for each nutrient its pools meet together, 0–1. */
export function feederShares(draws: readonly PoolDraw[]): NutrientVector {
  const met = draws.map(({ shares }) => formsMeet(shares));
  return mapNutrients((n) => draws.reduce((sum, { weight }, p) => sum + weight * met[p][n], 0));
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
  return liebig(feederShares(poolDraws(pools, plantFeeder(species, config))));
}

/** mg of each nutrient in a gram of organic matter — food, its waste, plant and algae tissue alike — its nitrogen counted as the nitrate it ends up as. */
export function organicNutrients(livestock: LivestockConfig, nutrients: NutrientsConfig): NutrientVector {
  return { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent };
}

/** mg of each nutrient, as the recipe counts it, that these masses of its forms carry. */
export function nutrientsIn(forms: FormVector): NutrientVector {
  return mapNutrients((n) => FORMS_OF[n].reduce((sum, f) => sum + forms[f] / FORM_MASS[f], 0));
}

export interface TissueNeed<P extends readonly NutrientPool[] = TankPools> {
  grams: number;
  draws: PerPool<P, PoolDraw>;
}

export interface TissueDraw<P extends readonly NutrientPool[] = TankPools> {
  /** Share of each feeder's tissue the pools supplied, 0–1, in the order of the needs. */
  supplied: number[];
  /** mg of each form each feeder took from each pool, in the order of the needs. */
  taken: PerPool<P, FormVector>[];
}

/**
 * The share of each feeder's new tissue its pools supply, and what that tissue
 * takes out of each pool at the recipe. Each form in a pool meets every
 * request on it at one fraction, through `monodUptake`, so no pool is ever
 * overdrawn and no feeder is served before another; a nutrient's later forms
 * are asked only for what its earlier ones left unmet.
 */
export function drawTissue<P extends readonly NutrientPool[]>(
  needs: readonly TissueNeed<P>[],
  pools: P,
  recipe: NutrientVector
): TissueDraw<P> {
  const perForm = mapForms((f) => recipe[NUTRIENT_OF[f]] * FORM_MASS[f]);
  const reach = pools.map((pool, p) =>
    poolReach(
      needs.map(({ grams, draws }) => ({ grams, ...draws[p] })),
      pool.stock,
      perForm
    )
  );
  const supply = needs.map((_, i) =>
    mapNutrients((n) => reach.reduce((sum, pool) => sum + FORMS_OF[n].reduce((met, f) => met + pool[i][f], 0), 0))
  );
  const supplied = supply.map((share) => Math.min(...NUTRIENTS.map((n) => (recipe[n] > 0 ? share[n] : 1))));

  const taken = needs.map(({ grams }, i) =>
    pools.map((_, p) =>
      mapForms((f) => {
        const r = reach[p][i][f];
        return r > 0 ? grams * supplied[i] * perForm[f] * (r / supply[i][NUTRIENT_OF[f]]) : 0;
      })
    )
  ) as PerPool<P, FormVector>[];
  return { supplied, taken };
}

/**
 * mg of GH, as CaCO3, new tissue takes out of the water beside the nitrogen it
 * took, counted as nitrate: on its own Monod, and never a limit on growth.
 */
export function ghDrawn(nitrate: number, water: Pick<Resources, 'gh' | 'water'>): number {
  return monodUptake(
    water.gh,
    nitrate * GH_PER_NITRATE_DRAWN,
    getMassFromPpm(GH_HALF_SATURATION, water.water)
  );
}

/**
 * Share of each request's need, per form, that one pool delivers this tick:
 * its weight there, times what it asked of the form, times the fraction the
 * form met. A nutrient's forms are asked in turn, each for what those before
 * it left unmet.
 */
function poolReach(
  requests: readonly (PoolDraw & { grams: number })[],
  stock: FormVector,
  recipe: FormVector
): FormVector[] {
  const reach = requests.map(() => mapForms(() => 0));
  for (const n of NUTRIENTS) {
    const unmet = requests.map(() => 1);
    for (const f of FORMS_OF[n]) {
      const asked = requests.map(({ grams, weight }, i) => grams * weight * unmet[i]);
      const met = metFraction(asked, requests.map(({ shares }) => shares[f]), stock[f], recipe[f]);
      requests.forEach(({ weight, shares }, i) => {
        const arrived = unmet[i] * shares[f] * met;
        reach[i][f] = weight * arrived;
        unmet[i] -= arrived;
      });
    }
  }
  return reach;
}

/**
 * Fraction of what its requests ask of one form that the stock delivers: one
 * consumer at the half-saturation that would ask, at the tick's start, what
 * they ask together, drawn through `monodUptake`.
 */
function metFraction(asked: readonly number[], shares: readonly number[], stock: number, recipe: number): number {
  const grams = asked.reduce((sum, a) => sum + a, 0);
  const requested = asked.reduce((sum, a, i) => sum + a * shares[i], 0);
  if (requested <= 0 || recipe <= 0) return 0;
  const delivered = monodUptake(stock, grams * recipe, stock * (grams / requested - 1));
  return delivered / (requested * recipe);
}
