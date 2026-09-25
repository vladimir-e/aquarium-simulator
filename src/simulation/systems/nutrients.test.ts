import { describe, it, expect } from 'vitest';
import { getDemandMultiplier, calculateNutrientSufficiency } from './nutrients.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import type { Resources } from '../state.js';

const WATER = 40;

function resourcesAt(share: number, overrides: Partial<Resources> = {}): Resources {
  const mass = (ppm: number): number => ppm * WATER * share;
  return {
    water: WATER,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    aeration: false,
    food: 0,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: mass(nutrientsDefaults.optimalNitratePpm),
    oxygen: 8,
    co2: 5,
    kh: 0,
    aob: 1,
    nob: 1,
    phosphate: mass(nutrientsDefaults.optimalPhosphatePpm),
    potassium: mass(nutrientsDefaults.optimalPotassiumPpm),
    iron: mass(nutrientsDefaults.optimalIronPpm),
    ...overrides,
  };
}

describe('getDemandMultiplier', () => {
  it('reads each demand class off the config', () => {
    expect(getDemandMultiplier('low')).toBe(nutrientsDefaults.lowDemandMultiplier);
    expect(getDemandMultiplier('medium')).toBe(nutrientsDefaults.mediumDemandMultiplier);
    expect(getDemandMultiplier('high')).toBe(nutrientsDefaults.highDemandMultiplier);
    expect(getDemandMultiplier('low', { ...nutrientsDefaults, lowDemandMultiplier: 0.5 })).toBe(0.5);
  });
});

describe('calculateNutrientSufficiency', () => {
  it('is full for a low-demand plant at its share of optimal', () => {
    const share = nutrientsDefaults.lowDemandMultiplier;
    expect(calculateNutrientSufficiency(resourcesAt(share), WATER, 'java_fern')).toBeCloseTo(1, 10);
  });

  it('caps at 1 above optimal', () => {
    expect(calculateNutrientSufficiency(resourcesAt(2), WATER, 'dwarf_hairgrass')).toBe(1);
  });

  it('is zero with no nutrients or no water', () => {
    expect(calculateNutrientSufficiency(resourcesAt(0), WATER, 'java_fern')).toBe(0);
    expect(calculateNutrientSufficiency(resourcesAt(1), 0, 'java_fern')).toBe(0);
  });

  it('follows Liebig: the scarcest required nutrient sets it', () => {
    const halfIron = resourcesAt(1, { iron: nutrientsDefaults.optimalIronPpm * WATER * 0.5 });
    const expected = 0.5 / nutrientsDefaults.highDemandMultiplier;
    expect(calculateNutrientSufficiency(halfIron, WATER, 'dwarf_hairgrass')).toBeCloseTo(
      Math.min(1, expected),
      10
    );
  });

  it('asks less of a low-demand plant than a high-demand one', () => {
    const lean = resourcesAt(nutrientsDefaults.lowDemandMultiplier);
    expect(calculateNutrientSufficiency(lean, WATER, 'java_fern')).toBeGreaterThan(
      calculateNutrientSufficiency(lean, WATER, 'dwarf_hairgrass')
    );
  });

  it('gates each demand class on its own set of nutrients', () => {
    const without = (...nutrients: (keyof Resources)[]): Resources =>
      resourcesAt(1, Object.fromEntries(nutrients.map((n) => [n, 0])));

    expect(calculateNutrientSufficiency(without('potassium', 'iron'), WATER, 'java_fern')).toBe(1);
    expect(calculateNutrientSufficiency(without('potassium', 'iron'), WATER, 'amazon_sword')).toBe(1);
    expect(calculateNutrientSufficiency(without('phosphate'), WATER, 'amazon_sword')).toBe(0);
    expect(calculateNutrientSufficiency(without('iron'), WATER, 'monte_carlo')).toBe(0);
  });
});
