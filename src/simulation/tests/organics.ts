import { expect } from 'vitest';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients } from '../config/nutrients.js';
import { atRecipe, type Organics } from '../core/organics.js';

/** A composition far from food's: lean in carbon and nitrogen, rich in potassium. */
export const LEAN: Organics = { grams: 1, carbon: 0.3, nutrients: { nitrate: 40, phosphate: 3, potassium: 20, iron: 0.05 } };

/** Matches organics within `digits` of these, grams, carbon and every nutrient alike. */
export function organicsCloseTo(expected: Organics, digits = 9): Organics {
  return {
    grams: expect.closeTo(expected.grams, digits),
    carbon: expect.closeTo(expected.carbon, digits),
    nutrients: mapNutrients((n) => expect.closeTo(expected.nutrients[n], digits)),
  };
}

/** `grams` of food at the default recipe. */
export const ofFood = (grams: number): Organics => atRecipe(grams, DEFAULT_CONFIG);
