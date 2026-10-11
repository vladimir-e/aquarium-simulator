/**
 * Organic matter as a pool holds it — food, a gut, the standing waste, the
 * bed's mulm: grams of dry mass, the grams of carbon in them, and the mg of
 * each nutrient, nitrogen counted as the nitrate it ends up as. Whatever enters
 * brings its own composition, and whatever leaves takes its share of the
 * content with it.
 */

import { nitratePerGramOfFood, type LivestockConfig } from '../config/livestock.js';
import { mapNutrients, ZERO_NUTRIENTS, type NutrientsConfig, type NutrientVector } from '../config/nutrients.js';
import { sum } from './sum.js';

/** What a gram of dry mass is made of: grams of carbon, and mg of each nutrient. */
export interface Composition {
  carbon: number;
  nutrients: NutrientVector;
}

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

export function foodRecipe({ livestock, nutrients }: RecipeConfig): Composition {
  return {
    carbon: livestock.foodCarbonFraction,
    nutrients: { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent },
  };
}

export function ofComposition(grams: number, perGram: Composition): Organics {
  return { grams, carbon: grams * perGram.carbon, nutrients: mapNutrients((n) => grams * perGram.nutrients[n]) };
}

export function atRecipe(grams: number, config: RecipeConfig): Organics {
  return ofComposition(grams, foodRecipe(config));
}

export function scaleOrganics(pool: Organics, factor: number): Organics {
  return {
    grams: pool.grams * factor,
    carbon: pool.carbon * factor,
    nutrients: mapNutrients((n) => pool.nutrients[n] * factor),
  };
}

/** `grams` of the pool, at its composition. */
export function portion(pool: Organics, grams: number): Organics {
  return scaleOrganics(pool, pool.grams > 0 ? grams / pool.grams : 0);
}

/** The pools together, every part never below empty. */
export function addOrganics(...pools: readonly Organics[]): Organics {
  return {
    grams: Math.max(0, sum(pools.map((pool) => pool.grams))),
    carbon: Math.max(0, sum(pools.map((pool) => pool.carbon))),
    nutrients: mapNutrients((n) => Math.max(0, sum(pools.map((pool) => pool.nutrients[n])))),
  };
}
