import { expect } from 'vitest';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients } from '../config/nutrients.js';
import { atRecipe, elements, type OrganicElement, type Organics } from '../core/organics.js';
import { FISH_COMPOSITION } from '../systems/fish-body.js';

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

/** A gram of a fish's composition with every element `times` its own, `e` alone `eTimes`. */
export function meal(times: number, e?: OrganicElement, eTimes = times): Organics {
  const at = (el: OrganicElement): number => elements(FISH_COMPOSITION)[el] * (el === e ? eTimes : times);
  return { grams: 1, carbon: at('carbon'), nutrients: mapNutrients(at) };
}
