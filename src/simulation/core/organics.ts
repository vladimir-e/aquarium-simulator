/**
 * Organic matter as a pool holds it — the standing waste, the bed's mulm:
 * grams, and the mg of each nutrient inside them, nitrogen counted as the
 * nitrate it ends up as. Whatever enters brings its own composition, and
 * whatever leaves takes its share of the content with it.
 */

import { nitratePerGramOfFood, type LivestockConfig } from '../config/livestock.js';
import { mapNutrients, ZERO_NUTRIENTS, type NutrientsConfig, type NutrientVector } from '../config/nutrients.js';
import { sum } from './sum.js';

export interface Organics {
  grams: number;
  nutrients: NutrientVector;
}

export const NO_ORGANICS: Readonly<Organics> = Object.freeze({ grams: 0, nutrients: ZERO_NUTRIENTS });

export interface RecipeConfig {
  livestock: LivestockConfig;
  nutrients: NutrientsConfig;
}

/** mg of each nutrient in a gram of food — and of the fish made of it. */
export function foodRecipe({ livestock, nutrients }: RecipeConfig): NutrientVector {
  return { nitrate: nitratePerGramOfFood(livestock), ...nutrients.foodMineralContent };
}

export function ofComposition(grams: number, perGram: NutrientVector): Organics {
  return { grams, nutrients: mapNutrients((n) => grams * perGram[n]) };
}

export function atRecipe(grams: number, config: RecipeConfig): Organics {
  return ofComposition(grams, foodRecipe(config));
}

export function scaleOrganics(pool: Organics, factor: number): Organics {
  return { grams: pool.grams * factor, nutrients: mapNutrients((n) => pool.nutrients[n] * factor) };
}

/** The pools together, never below empty: a pool with no grams left holds nothing. */
export function addOrganics(...pools: readonly Organics[]): Organics {
  const grams = sum(pools.map((pool) => pool.grams));
  if (grams <= 0) return NO_ORGANICS;
  return { grams, nutrients: mapNutrients((n) => Math.max(0, sum(pools.map((pool) => pool.nutrients[n])))) };
}
