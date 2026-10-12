import { describe, it, expect } from 'vitest';
import { addOrganics, atRecipe, buildable, foodRecipe, NO_ORGANICS, portion, scaleOrganics, sumOrganics } from './organics.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { NUTRIENTS, WASTE_NUTRIENTS } from '../config/nutrients.js';
import { MW_N, MW_NO3 } from './chemistry.js';
import { LEAN, organicsCloseTo } from '../tests/organics.js';

describe('foodRecipe', () => {
  const recipe = foodRecipe(DEFAULT_CONFIG);

  it('is a gram of food', () => {
    expect(recipe.grams).toBe(1);
  });

  it('carries the carbon of food', () => {
    expect(recipe.carbon).toBe(DEFAULT_CONFIG.livestock.foodCarbonFraction);
  });

  it('carries the nitrogen of food, as the nitrate it ends up as', () => {
    expect((recipe.nutrients.nitrate * MW_N) / MW_NO3 / 1000).toBeCloseTo(DEFAULT_CONFIG.livestock.foodNitrogenFraction, 12);
  });

  it('carries the minerals of food', () => {
    for (const n of WASTE_NUTRIENTS) expect(recipe.nutrients[n]).toBe(DEFAULT_CONFIG.nutrients.foodMineralContent[n]);
  });
});

describe('organics', () => {
  it('hold their grams at the composition they came in at, carbon and every nutrient', () => {
    const pool = portion(LEAN, 3);
    expect(pool.grams).toBe(3);
    expect(pool.carbon).toBe(3 * LEAN.carbon);
    for (const n of NUTRIENTS) expect(pool.nutrients[n]).toBe(3 * LEAN.nutrients[n]);
    expect(atRecipe(3, DEFAULT_CONFIG)).toEqual(portion(foodRecipe(DEFAULT_CONFIG), 3));
  });

  it('give up a share with that share of their carbon and every nutrient', () => {
    const pool = addOrganics(portion(LEAN, 2), atRecipe(1, DEFAULT_CONFIG));
    const share = scaleOrganics(pool, 0.3);
    expect(share.carbon / share.grams).toBeCloseTo(pool.carbon / pool.grams, 12);
    for (const n of NUTRIENTS) expect(share.nutrients[n] / share.grams).toBeCloseTo(pool.nutrients[n] / pool.grams, 12);
  });

  it('give up a portion of grams at their composition, and nothing from an empty pool', () => {
    const pool = addOrganics(portion(LEAN, 2), atRecipe(1, DEFAULT_CONFIG));
    expect(portion(pool, 0.6)).toEqual(organicsCloseTo(scaleOrganics(pool, 0.2), 12));
    expect(portion(NO_ORGANICS, 0.6)).toEqual(NO_ORGANICS);
  });

  it('add up grams, carbon and content alike, whatever each part was made of', () => {
    const lean = portion(LEAN, 2);
    const food = atRecipe(1, DEFAULT_CONFIG);
    const pool = addOrganics(lean, food);
    expect(pool.grams).toBe(3);
    expect(pool.carbon).toBeCloseTo(lean.carbon + food.carbon, 12);
    for (const n of NUTRIENTS) expect(pool.nutrients[n]).toBeCloseTo(lean.nutrients[n] + food.nutrients[n], 12);
  });

  it('come back to what they were when a share leaves and returns', () => {
    const pool = portion(LEAN, 2);
    const share = scaleOrganics(pool, 0.4);
    expect(addOrganics(pool, scaleOrganics(share, -1), share)).toEqual(organicsCloseTo(pool));
  });

  it('empty, content and all, when their grams run out', () => {
    const pool = portion(LEAN, 2);
    expect(addOrganics(pool, scaleOrganics(pool, -1.5))).toEqual(NO_ORGANICS);
    expect(addOrganics(pool, scaleOrganics(pool, -1))).toEqual(NO_ORGANICS);
    expect(addOrganics(pool, scaleOrganics({ ...pool, carbon: pool.carbon / 2 }, -1))).toEqual(NO_ORGANICS);
  });

  it('net flows exactly, content below none included, where a pool never holds less than none', () => {
    const lean = portion(LEAN, 2);
    const food = scaleOrganics(atRecipe(1, DEFAULT_CONFIG), -1);
    expect(sumOrganics(lean, food).nutrients.nitrate).toBeLessThan(0);
    for (const n of NUTRIENTS) expect(sumOrganics(lean, food).nutrients[n]).toBe(lean.nutrients[n] + food.nutrients[n]);
    expect(addOrganics(lean, food).nutrients.nitrate).toBe(0);
  });
});

describe('buildable', () => {
  const food = foodRecipe(DEFAULT_CONFIG);

  it('builds as many grams of a composition as the pool’s scarcest element holds, and that composition’s own grams of itself', () => {
    const shares = [LEAN.carbon / food.carbon, ...NUTRIENTS.map((n) => LEAN.nutrients[n] / food.nutrients[n])];
    expect(buildable(portion(LEAN, 3), food)).toBeCloseTo(3 * Math.min(...shares), 12);
    expect(buildable(portion(food, 2), food)).toBeCloseTo(2, 12);
  });

  it('counts only the elements the composition carries', () => {
    const ironless = { ...food, nutrients: { ...food.nutrients, iron: 0 } };
    expect(buildable(ironless, ironless)).toBeCloseTo(1, 12);
  });

  it('builds nothing of nothing', () => {
    expect(buildable(NO_ORGANICS, food)).toBe(0);
  });
});
