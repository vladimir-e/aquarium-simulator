/**
 * Nutrition — how much of each nutrient a feeder needs, how much of that need
 * the tank's pools meet, and what its stores take out of them. Plants and
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
 * A feeder's stores ask for what they lack, and what the pools deliver moves
 * into them: a plant or a bloom holds the N, P, K and Fe it took up, in its
 * stores and its structure, and never makes or loses any.
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
import {
  alkalinityMoved,
  MW_NH3,
  MW_NO3,
  NO3_TO_NH3_MASS_RATIO,
  PROTONS_PER_N,
} from '../core/chemistry.js';
import { monodFactor, monodUptake } from '../core/kinetics.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';

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

/** mg of each nutrient, as the recipe counts it, that these masses of its forms carry. */
export function nutrientsIn(forms: FormVector): NutrientVector {
  return mapNutrients((n) => FORMS_OF[n].reduce((sum, f) => sum + forms[f] / FORM_MASS[f], 0));
}

/** mg of each nutrient a feeder asks of saturating water, and where it feeds. */
export interface NutrientRequest<P extends readonly NutrientPool[] = TankPools> {
  asked: NutrientVector;
  draws: PerPool<P, PoolDraw>;
}

export interface NutrientDelivery<P extends readonly NutrientPool[] = TankPools> {
  /** mg of each nutrient each feeder received, in the order of the requests. */
  delivered: NutrientVector[];
  /** mg of each form each feeder took up from each pool, in the order of the requests. */
  uptake: PerPool<P, FormVector>[];
}

/**
 * What the pools deliver on every request: each form in a pool meets every
 * request on it at its feeder's Monod share and one fraction, through
 * `monodUptake`, so no pool is ever overdrawn and no feeder is served before
 * another; a nutrient's later forms are asked only for what its earlier ones
 * left unmet.
 */
export function drawNutrients<P extends readonly NutrientPool[]>(
  requests: readonly NutrientRequest<P>[],
  pools: P
): NutrientDelivery<P> {
  const reach = pools.map((pool, p) =>
    poolReach(
      requests.map(({ asked, draws }) => ({ asked, ...draws[p] })),
      pool.stock
    )
  );
  const delivered = requests.map(({ asked }, i) =>
    mapNutrients((n) => asked[n] * reach.reduce((sum, pool) => sum + FORMS_OF[n].reduce((met, f) => met + pool[i][f], 0), 0))
  );
  const uptake = requests.map(({ asked }, i) =>
    pools.map((_, p) => mapForms((f) => asked[NUTRIENT_OF[f]] * reach[p][i][f] * FORM_MASS[f]))
  ) as PerPool<P, FormVector>[];
  return { delivered, uptake };
}

/**
 * mg of GH, as CaCO3, uptake takes out of the water beside the nitrogen it
 * took, counted as nitrate: on its own Monod, and never a limit on growth.
 */
export function ghDrawn(nitrate: number, water: Pick<Resources, 'gh' | 'water'>): number {
  return monodUptake(
    water.gh,
    nitrate * GH_PER_NITRATE_DRAWN,
    getMassFromPpm(GH_HALF_SATURATION, water.water)
  );
}

/** mg of KH, as CaCO3, taking up these forms moves. */
export function uptakeAlkalinity(uptake: FormVector): number {
  return (
    alkalinityMoved(uptake.ammonia / MW_NH3, PROTONS_PER_N.ammoniumUptake) +
    alkalinityMoved(uptake.nitrate / MW_NO3, PROTONS_PER_N.nitrateUptake)
  );
}

/**
 * Share of each request's ask, per form, that one pool delivers this tick:
 * its weight there, times the share the form meets, times the fraction the
 * pool can deliver. A nutrient's forms are asked in turn, each for what those
 * before it left unmet.
 */
function poolReach(requests: readonly (PoolDraw & { asked: NutrientVector })[], stock: FormVector): FormVector[] {
  const reach = requests.map(() => mapForms(() => 0));
  for (const n of NUTRIENTS) {
    const unmet = requests.map(() => 1);
    for (const f of FORMS_OF[n]) {
      const asked = requests.map(({ asked, weight }, i) => asked[n] * FORM_MASS[f] * weight * unmet[i]);
      const met = metFraction(asked, requests.map(({ shares }) => shares[f]), stock[f]);
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
 * Fraction of what its requests ask of one form, mg each, that the stock
 * delivers: one consumer at the half-saturation that would ask, at the tick's
 * start, what they ask together, drawn through `monodUptake`.
 */
function metFraction(asked: readonly number[], shares: readonly number[], stock: number): number {
  const capacity = asked.reduce((sum, a) => sum + a, 0);
  const requested = asked.reduce((sum, a, i) => sum + a * shares[i], 0);
  if (requested <= 0) return 0;
  return monodUptake(stock, capacity, stock * (capacity / requested - 1)) / requested;
}
