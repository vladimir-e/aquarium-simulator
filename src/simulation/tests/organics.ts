import { expect } from 'vitest';
import { mapNutrients } from '../config/nutrients.js';
import type { Organics } from '../core/organics.js';

/** Matches organics within `digits` of these, grams and every nutrient alike. */
export function organicsCloseTo(expected: Organics, digits = 9): Organics {
  return {
    grams: expect.closeTo(expected.grams, digits),
    nutrients: mapNutrients((n) => expect.closeTo(expected.nutrients[n], digits)),
  };
}
