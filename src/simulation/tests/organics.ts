import { expect } from 'vitest';
import { mapNutrients, type NutrientVector } from '../config/nutrients.js';
import type { Organics } from '../core/organics.js';

/** A composition far from food's: lean in nitrogen and rich in potassium. */
export const LEAN: NutrientVector = { nitrate: 40, phosphate: 3, potassium: 20, iron: 0.05 };

/** Matches organics within `digits` of these, grams and every nutrient alike. */
export function organicsCloseTo(expected: Organics, digits = 9): Organics {
  return {
    grams: expect.closeTo(expected.grams, digits),
    nutrients: mapNutrients((n) => expect.closeTo(expected.nutrients[n], digits)),
  };
}
