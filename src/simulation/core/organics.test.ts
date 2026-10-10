import { describe, it, expect } from 'vitest';
import { addOrganics, atRecipe, foodRecipe, NO_ORGANICS, ofComposition, scaleOrganics } from './organics.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { NUTRIENTS, WASTE_NUTRIENTS } from '../config/nutrients.js';
import { MW_N, MW_NO3 } from './chemistry.js';
import { organicsCloseTo } from '../tests/organics.js';

describe('foodRecipe', () => {
  const recipe = foodRecipe(DEFAULT_CONFIG);

  it('carries the nitrogen of food, as the nitrate it ends up as', () => {
    expect((recipe.nitrate * MW_N) / MW_NO3 / 1000).toBeCloseTo(DEFAULT_CONFIG.livestock.foodNitrogenFraction, 12);
  });

  it('carries the minerals of food', () => {
    for (const n of WASTE_NUTRIENTS) expect(recipe[n]).toBe(DEFAULT_CONFIG.nutrients.foodMineralContent[n]);
  });
});

describe('organics', () => {
  const perGram = { nitrate: 4, phosphate: 1, potassium: 0.5, iron: 0.01 };

  it('hold their grams at the composition they came in at', () => {
    const pool = ofComposition(3, perGram);
    expect(pool.grams).toBe(3);
    for (const n of NUTRIENTS) expect(pool.nutrients[n]).toBe(3 * perGram[n]);
    expect(atRecipe(3, DEFAULT_CONFIG)).toEqual(ofComposition(3, foodRecipe(DEFAULT_CONFIG)));
  });

  it('give up a share with that share of every nutrient', () => {
    const pool = addOrganics(ofComposition(2, perGram), atRecipe(1, DEFAULT_CONFIG));
    const share = scaleOrganics(pool, 0.3);
    for (const n of NUTRIENTS) expect(share.nutrients[n] / share.grams).toBeCloseTo(pool.nutrients[n] / pool.grams, 12);
  });

  it('add up grams and content alike, whatever each part was made of', () => {
    const lean = ofComposition(2, perGram);
    const food = atRecipe(1, DEFAULT_CONFIG);
    const pool = addOrganics(lean, food);
    expect(pool.grams).toBe(3);
    for (const n of NUTRIENTS) expect(pool.nutrients[n]).toBeCloseTo(lean.nutrients[n] + food.nutrients[n], 12);
  });

  it('come back to what they were when a share leaves and returns', () => {
    const pool = ofComposition(2, perGram);
    const share = scaleOrganics(pool, 0.4);
    expect(addOrganics(pool, scaleOrganics(share, -1), share)).toEqual(organicsCloseTo(pool));
  });

  it('empty, content and all, when more leaves than they hold', () => {
    const pool = ofComposition(2, perGram);
    expect(addOrganics(pool, scaleOrganics(pool, -1.5))).toEqual(NO_ORGANICS);
    expect(addOrganics(pool, scaleOrganics(pool, -1))).toEqual(NO_ORGANICS);
  });
});
