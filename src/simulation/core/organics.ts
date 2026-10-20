/**
 * Organic matter as a pool holds it — food, a gut, the standing waste, the
 * bed's mulm: grams of dry mass, the grams of carbon in them, and the mg of
 * each nutrient, nitrogen counted as the nitrate it ends up as. Whatever enters
 * brings its own composition, and whatever leaves takes its share of the
 * content with it.
 */

import { nitratePerGramOfFood, type LivestockConfig } from '../config/livestock.js';
import { mapNutrients, NUTRIENTS, ZERO_NUTRIENTS, type NutrientsConfig, type NutrientVector } from '../config/nutrients.js';
import { sum } from './sum.js';

export interface Organics {
  grams: number;
  carbon: number;
  nutrients: NutrientVector;
}

export const NO_ORGANICS: Readonly<Organics> = Object.freeze({ grams: 0, carbon: 0, nutrients: ZERO_NUTRIENTS });

export interface RecipeConfig {
  livestock: LivestockConfig;
  nutrients: NutrientsConfig;
}

export function foodRecipe({ livestock, nutrients }: RecipeConfig): Organics {
  return {
    grams: 1,
    carbon: livestock.foodCarbonFraction,
    nutrients: { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent },
  };
}

export function atRecipe(grams: number, config: RecipeConfig): Organics {
  return portion(foodRecipe(config), grams);
}

export function scaleOrganics(pool: Organics, factor: number): Organics {
  return {
    grams: pool.grams * factor,
    carbon: pool.carbon * factor,
    nutrients: mapNutrients((n) => pool.nutrients[n] * factor),
  };
}

export function portion(pool: Organics, grams: number): Organics {
  return scaleOrganics(pool, pool.grams > 0 ? grams / pool.grams : 0);
}

/** Flows netted exactly, a negative one's every element with it. */
export function sumOrganics(...flows: readonly Organics[]): Organics {
  return {
    grams: sum(flows.map((flow) => flow.grams)),
    carbon: sum(flows.map((flow) => flow.carbon)),
    nutrients: mapNutrients((n) => sum(flows.map((flow) => flow.nutrients[n]))),
  };
}

export const ELEMENTS = ['carbon', ...NUTRIENTS] as const;

export type OrganicElement = (typeof ELEMENTS)[number];

export function elements(pool: Organics): Record<OrganicElement, number> {
  return { carbon: pool.carbon, ...pool.nutrients };
}

function sufficiency(pool: Organics, of: Organics): Record<OrganicElement, number> {
  const held = elements(pool);
  const needed = elements(of);
  return Object.fromEntries(
    ELEMENTS.map((e) => [e, needed[e] > 0 ? held[e] / needed[e] : Infinity])
  ) as Record<OrganicElement, number>;
}

/** Grams of `of`'s composition the carbon and nutrients `pool` holds can build, its scarcest element ruling. */
export function buildable(pool: Organics, of: Organics): number {
  return of.grams * Math.min(...Object.values(sufficiency(pool, of)));
}

/** The element `pool` runs out of first building `of`'s composition. */
export function scarcest(pool: Organics, of: Organics): OrganicElement {
  const held = sufficiency(pool, of);
  return ELEMENTS.reduce((least, e) => (held[e] < held[least] ? e : least));
}

/** Pools summed into one: no element held below zero, and nothing held at no grams. */
export function addOrganics(...pools: readonly Organics[]): Organics {
  const total = sumOrganics(...pools);
  if (total.grams <= 0) return NO_ORGANICS;
  return {
    grams: total.grams,
    carbon: Math.max(0, total.carbon),
    nutrients: mapNutrients((n) => Math.max(0, total.nutrients[n])),
  };
}
