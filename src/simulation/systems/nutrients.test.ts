import { describe, it, expect } from 'vitest';
import {
  getDemandMultiplier,
  calculateNutrientSufficiency,
} from './nutrients.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import type { Resources } from '../state.js';

describe('nutrients system', () => {
  // Helper to create resources with specific nutrient levels
  function createResources(overrides: Partial<Resources> = {}): Resources {
    return {
      water: 40,
      temperature: 25,
      surface: 1000,
      flow: 100,
      light: 0,
      aeration: false,
      food: 0,
      waste: 0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      oxygen: 8,
      co2: 5,
      ph: 7,
      aob: 1,
      nob: 1,
      phosphate: 0,
      potassium: 0,
      iron: 0,
      ...overrides,
    };
  }

  // Helper to create plant at optimal nutrient levels for 40L tank
  function createOptimalResources(): Resources {
    // Optimal levels: nitrate 15ppm, phosphate 1ppm, potassium 10ppm, iron 0.2ppm
    // In 40L: mass = ppm * 40
    return createResources({
      nitrate: 15 * 40, // 600mg
      phosphate: 1 * 40, // 40mg
      potassium: 10 * 40, // 400mg
      iron: 0.2 * 40, // 8mg
    });
  }

  describe('getDemandMultiplier', () => {
    it('returns low demand multiplier', () => {
      expect(getDemandMultiplier('low')).toBe(nutrientsDefaults.lowDemandMultiplier);
    });

    it('returns medium demand multiplier', () => {
      expect(getDemandMultiplier('medium')).toBe(nutrientsDefaults.mediumDemandMultiplier);
    });

    it('returns high demand multiplier', () => {
      expect(getDemandMultiplier('high')).toBe(nutrientsDefaults.highDemandMultiplier);
    });

    it('uses custom config when provided', () => {
      const customConfig = {
        ...nutrientsDefaults,
        lowDemandMultiplier: 0.5,
      };

      expect(getDemandMultiplier('low', customConfig)).toBe(0.5);
    });
  });

  describe('calculateNutrientSufficiency', () => {
    it('returns 1.0 when all nutrients at optimal for low-demand plants', () => {
      // Low-demand plants need 30% of optimal
      // For java_fern (low demand), multiply optimal by 0.3
      const resources = createResources({
        nitrate: 15 * 40 * 0.3, // 180mg = 4.5ppm (30% of 15ppm optimal)
        phosphate: 1 * 40 * 0.3, // 12mg = 0.3ppm
        potassium: 10 * 40 * 0.3, // 120mg = 3ppm
        iron: 0.2 * 40 * 0.3, // 2.4mg = 0.06ppm
      });

      const sufficiency = calculateNutrientSufficiency(resources, 40, 'java_fern');

      expect(sufficiency).toBeCloseTo(1.0, 1);
    });

    it('returns 1.0 when nutrients exceed optimal', () => {
      const resources = createOptimalResources();
      // Double the nutrients
      resources.nitrate *= 2;
      resources.phosphate *= 2;
      resources.potassium *= 2;
      resources.iron *= 2;

      const sufficiency = calculateNutrientSufficiency(resources, 40, 'dwarf_hairgrass');

      // Sufficiency is capped at 1.0
      expect(sufficiency).toBe(1.0);
    });

    it('returns 0 when no nutrients available', () => {
      const resources = createResources();

      const sufficiency = calculateNutrientSufficiency(resources, 40, 'java_fern');

      expect(sufficiency).toBe(0);
    });

    it("uses Liebig's Law - returns minimum factor", () => {
      // All nutrients at optimal except iron at 50 %
      const resources = createOptimalResources();
      resources.iron = nutrientsDefaults.optimalIronPpm * 0.5 * 40;

      const sufficiency = calculateNutrientSufficiency(resources, 40, 'dwarf_hairgrass');

      // High-demand species → iron is required → Liebig caps at 0.5.
      expect(sufficiency).toBeCloseTo(0.5, 2);
    });

    it('returns 0 for zero water volume', () => {
      const resources = createOptimalResources();

      const sufficiency = calculateNutrientSufficiency(resources, 0, 'java_fern');

      expect(sufficiency).toBe(0);
    });

    it('low-demand plants need less nutrients than high-demand', () => {
      // Resources at 30% of optimal (just enough for low-demand)
      const resources = createResources({
        nitrate: 15 * 40 * 0.3,
        phosphate: 1 * 40 * 0.3,
        potassium: 10 * 40 * 0.3,
        iron: 0.2 * 40 * 0.3,
      });

      const lowDemandSufficiency = calculateNutrientSufficiency(resources, 40, 'java_fern');
      const highDemandSufficiency = calculateNutrientSufficiency(resources, 40, 'dwarf_hairgrass');

      expect(lowDemandSufficiency).toBeGreaterThan(highDemandSufficiency);
    });

    it('treats K and Fe as *boosters* for low-demand plants (no gating)', () => {
      // Java fern should only be gated on nitrate. Zero out K and Fe — it
      // should still report full sufficiency as long as NO3 is optimal.
      const resources = createOptimalResources();
      resources.potassium = 0;
      resources.iron = 0;
      const s = calculateNutrientSufficiency(resources, 40, 'java_fern');
      expect(s).toBe(1);
    });

    it('treats K and Fe as *boosters* for medium-demand plants (PO4 still required)', () => {
      const resources = createOptimalResources();
      resources.potassium = 0;
      resources.iron = 0;
      const s = calculateNutrientSufficiency(resources, 40, 'amazon_sword');
      expect(s).toBe(1);
    });

    it('gates medium-demand plants on phosphate too', () => {
      const resources = createOptimalResources();
      resources.phosphate = 0;
      const s = calculateNutrientSufficiency(resources, 40, 'amazon_sword');
      expect(s).toBe(0);
    });

    it('gates high-demand plants on all four', () => {
      const resources = createOptimalResources();
      resources.iron = 0; // only Fe missing
      const s = calculateNutrientSufficiency(resources, 40, 'monte_carlo');
      expect(s).toBe(0);
    });
  });

  // Nutrient consumption moved into photosynthesis (see photosynthesis.test.ts);
  // plants draw nutrients in fertilizer ratio from the "potential photosynthesis"
  // pathway. There is no standalone nutrient consumption function.
  //
  // Lifecycle outcomes (shedding, death, death-waste) live in
  // `plant-lifecycle.test.ts`.
});
