import { describe, it, expect } from 'vitest';
import {
  getDemandMultiplier,
  calculateNutrientSufficiency,
  updatePlantCondition,
  conditionTargetFor,
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
  processPlantNutrients,
  getLimitingNutrient,
} from './nutrients.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import type { Plant, Resources } from '../state.js';

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

  describe('conditionTargetFor', () => {
    it('is linear in sufficiency', () => {
      expect(conditionTargetFor(0)).toBe(0);
      expect(conditionTargetFor(0.5)).toBe(50);
      expect(conditionTargetFor(1)).toBe(100);
    });

    it('clamps out-of-range sufficiency', () => {
      expect(conditionTargetFor(-0.1)).toBe(0);
      expect(conditionTargetFor(1.5)).toBe(100);
    });

    it('target = sufficiency × 100 across the full [0, 1] range', () => {
      // Exhaustive linearity pin — this is the S2 calibration's
      // homeostatic model invariant. Any future refactor that pushes
      // the target off the straight line (e.g. re-introduces
      // threshold-based zones) must break at least one of these.
      for (let i = 0; i <= 10; i++) {
        const s = i / 10;
        expect(conditionTargetFor(s)).toBe(s * 100);
      }
    });
  });

  describe('updatePlantCondition', () => {
    it('improves condition when thriving (sufficiency >= 0.8)', () => {
      const newCondition = updatePlantCondition(50, 0.9);

      expect(newCondition).toBe(50 + nutrientsDefaults.conditionRecoveryRate);
    });

    it('improves condition toward 65 % when adequate (0.5-0.8)', () => {
      // Homeostatic model: adequate plants trend toward ~65 % condition at
      // the recovery step rate (with saturation at the target).
      const newCondition = updatePlantCondition(50, 0.6);
      expect(newCondition).toBe(50 + nutrientsDefaults.conditionRecoveryRate);
    });

    it('drops condition toward 25 % when struggling (0.2-0.5)', () => {
      // Struggling plants relax toward ~25 % condition at the decay rate.
      const newCondition = updatePlantCondition(50, 0.3);
      expect(newCondition).toBe(50 - nutrientsDefaults.conditionDecayRate);
    });

    it('rapidly degrades condition when starving (< 0.2)', () => {
      const newCondition = updatePlantCondition(50, 0.1);

      expect(newCondition).toBe(50 - nutrientsDefaults.conditionDecayRate);
    });

    it('clamps condition to maximum 100', () => {
      // Start within reach of the target (100) so a single tick can hit it.
      const newCondition = updatePlantCondition(
        100 - nutrientsDefaults.conditionRecoveryRate * 0.5,
        1.0
      );
      expect(newCondition).toBeLessThanOrEqual(100);
      expect(newCondition).toBeGreaterThanOrEqual(99.4);
    });

    it('clamps condition to minimum 0', () => {
      // Pick a starting condition smaller than the per-tick decay so the
      // clamp kicks in regardless of the current tuning.
      const newCondition = updatePlantCondition(
        nutrientsDefaults.conditionDecayRate * 0.5,
        0
      );

      expect(newCondition).toBe(0);
    });

    it('uses custom config rates', () => {
      const customConfig = {
        ...nutrientsDefaults,
        conditionRecoveryRate: 10,
      };

      // At sufficiency 0.6, target = 60. From 50 with recovery rate 10,
      // one tick lands exactly at 60.
      const newCondition = updatePlantCondition(50, 0.6, customConfig);

      expect(newCondition).toBe(60);
    });

    describe('homeostatic dynamics (linear-in-sufficiency target)', () => {
      // Pins the S2 calibration's core observation: condition trends
      // toward `sufficiency × 100` rather than jumping between
      // threshold-defined zones. Verifies both the steady-state (once
      // condition ≈ target, no further movement) and the ramp (each
      // tick moves by at most `conditionRecoveryRate` or
      // `conditionDecayRate` toward the target).

      it.each([
        { sufficiency: 0.0, expectedTarget: 0 },
        { sufficiency: 0.25, expectedTarget: 25 },
        { sufficiency: 0.5, expectedTarget: 50 },
        { sufficiency: 0.75, expectedTarget: 75 },
        { sufficiency: 1.0, expectedTarget: 100 },
      ])(
        'condition settles at $expectedTarget for sufficiency $sufficiency',
        ({ sufficiency, expectedTarget }) => {
          // Starting from anywhere, after many ticks condition should
          // converge within one step of the linear target.
          let condition = 50;
          for (let i = 0; i < 500; i++) {
            condition = updatePlantCondition(condition, sufficiency);
          }
          const stepBound = Math.max(
            nutrientsDefaults.conditionRecoveryRate,
            nutrientsDefaults.conditionDecayRate
          );
          expect(Math.abs(condition - expectedTarget)).toBeLessThanOrEqual(
            stepBound
          );
        }
      );

      it('condition moves toward target, never overshoots', () => {
        // Starting below target → recovers by exactly
        // `conditionRecoveryRate` per tick until within one step.
        let condition = 20;
        const target = 80;
        const sufficiency = 0.8;
        while (condition < target - nutrientsDefaults.conditionRecoveryRate) {
          const next = updatePlantCondition(condition, sufficiency);
          expect(next - condition).toBeCloseTo(
            nutrientsDefaults.conditionRecoveryRate,
            6
          );
          condition = next;
        }
        // Final step lands exactly on target (no overshoot).
        const final = updatePlantCondition(condition, sufficiency);
        expect(final).toBeLessThanOrEqual(target);
        expect(final).toBeGreaterThanOrEqual(condition);
      });

      it('condition declines by exactly decayRate per tick when starting above linear target', () => {
        let condition = 90;
        const sufficiency = 0.2;
        const target = 20;
        while (condition > target + nutrientsDefaults.conditionDecayRate) {
          const next = updatePlantCondition(condition, sufficiency);
          expect(condition - next).toBeCloseTo(
            nutrientsDefaults.conditionDecayRate,
            6
          );
          condition = next;
        }
      });

      it('is monotonic in sufficiency at steady state', () => {
        // A plant with more nutrients should end up in better shape —
        // no pathological non-monotonic steps in the sufficiency
        // response curve.
        const settled = (s: number) => {
          let c = 50;
          for (let i = 0; i < 1000; i++) c = updatePlantCondition(c, s);
          return c;
        };
        const samples = [0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(settled);
        for (let i = 1; i < samples.length; i++) {
          expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
        }
      });
    });
  });

  describe('calculateShedding', () => {
    it('returns no shedding when condition above threshold', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 100,
        condition: 50, // Above default threshold of 30
      };

      const result = calculateShedding(plant);

      expect(result.sizeReduction).toBe(0);
      expect(result.wasteProduced).toBe(0);
    });

    it('calculates shedding when condition below threshold', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 100,
        condition: 15, // Below threshold of 30
      };

      const result = calculateShedding(plant);

      expect(result.sizeReduction).toBeGreaterThan(0);
      expect(result.wasteProduced).toBeGreaterThan(0);
    });

    it('increases shedding rate as condition decreases', () => {
      const plantLow: Plant = { id: '1', species: 'java_fern', size: 100, condition: 10 };
      const plantVeryLow: Plant = { id: '2', species: 'java_fern', size: 100, condition: 0 };

      const resultLow = calculateShedding(plantLow);
      const resultVeryLow = calculateShedding(plantVeryLow);

      expect(resultVeryLow.sizeReduction).toBeGreaterThan(resultLow.sizeReduction);
    });

    it('shedding at condition 0 equals max shedding rate', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 0 };

      const result = calculateShedding(plant);

      const expectedSizeReduction = 100 * nutrientsDefaults.maxSheddingRate;
      expect(result.sizeReduction).toBeCloseTo(expectedSizeReduction, 5);
    });

    it('waste scales with size reduction', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 0 };

      const result = calculateShedding(plant);

      const expectedWaste = result.sizeReduction * nutrientsDefaults.wastePerShedSize;
      expect(result.wasteProduced).toBeCloseTo(expectedWaste, 5);
    });
  });

  describe('shouldPlantDie', () => {
    it('returns true when condition below death threshold', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 50,
        condition: 5, // Below default threshold of 10
      };

      expect(shouldPlantDie(plant)).toBe(true);
    });

    it('returns true when size below death threshold', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 5, // Below default threshold of 10
        condition: 50,
      };

      expect(shouldPlantDie(plant)).toBe(true);
    });

    it('returns false when both above thresholds', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 50,
        condition: 50,
      };

      expect(shouldPlantDie(plant)).toBe(false);
    });

    it('returns true at exactly threshold boundary', () => {
      const plant: Plant = {
        id: 'test',
        species: 'java_fern',
        size: 50,
        condition: 9, // Just below 10
      };

      expect(shouldPlantDie(plant)).toBe(true);
    });
  });

  describe('calculateDeathWaste', () => {
    it('calculates waste based on plant size', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 5 };

      const waste = calculateDeathWaste(plant);

      expect(waste).toBe(100 * nutrientsDefaults.wastePerPlantDeath);
    });

    it('scales with plant size', () => {
      const smallPlant: Plant = { id: '1', species: 'java_fern', size: 50, condition: 5 };
      const largePlant: Plant = { id: '2', species: 'java_fern', size: 150, condition: 5 };

      const smallWaste = calculateDeathWaste(smallPlant);
      const largeWaste = calculateDeathWaste(largePlant);

      expect(largeWaste).toBe(smallWaste * 3);
    });
  });

  describe('processPlantNutrients', () => {
    it('updates condition based on sufficiency', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 50 };

      const result = processPlantNutrients(plant, 1.0);

      expect(result.plant.condition).toBe(50 + nutrientsDefaults.conditionRecoveryRate);
      expect(result.died).toBe(false);
    });

    it('handles shedding when condition low', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 20 };

      // Starving sufficiency will decrease condition further
      const result = processPlantNutrients(plant, 0);

      // Condition decreased
      expect(result.plant.condition).toBeLessThan(20);
      // If condition drops below shedding threshold, shedding occurs
      if (result.plant.condition < nutrientsDefaults.sheddingConditionThreshold) {
        expect(result.wasteReleased).toBeGreaterThan(0);
      }
    });

    it('marks plant as dead when condition too low', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 50, condition: 8 };

      const result = processPlantNutrients(plant, 0);

      expect(result.died).toBe(true);
      expect(result.plant.size).toBe(0);
      expect(result.wasteReleased).toBeGreaterThan(0);
    });

    it('includes sufficiency in result', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 50 };

      const result = processPlantNutrients(plant, 0.75);

      expect(result.sufficiency).toBe(0.75);
    });
  });

  // Nutrient consumption moved into photosynthesis (see photosynthesis.test.ts);
  // plants draw nutrients in fertilizer ratio from the "potential photosynthesis"
  // pathway. There is no standalone nutrient consumption function.

  describe('getLimitingNutrient', () => {
    it('identifies nitrate as limiting when lowest', () => {
      const resources = createResources({
        nitrate: 0, // Limiting
        phosphate: 1 * 40,
        potassium: 10 * 40,
        iron: 0.2 * 40,
      });

      const limiting = getLimitingNutrient(resources, 40, 'java_fern');

      expect(limiting).toBe('nitrate');
    });

    it('identifies phosphate as limiting when lowest', () => {
      const resources = createResources({
        nitrate: 15 * 40,
        phosphate: 0, // Limiting
        potassium: 10 * 40,
        iron: 0.2 * 40,
      });

      const limiting = getLimitingNutrient(resources, 40, 'java_fern');

      expect(limiting).toBe('phosphate');
    });

    it('identifies potassium as limiting when lowest', () => {
      const resources = createResources({
        nitrate: 15 * 40,
        phosphate: 1 * 40,
        potassium: 0, // Limiting
        iron: 0.2 * 40,
      });

      const limiting = getLimitingNutrient(resources, 40, 'java_fern');

      expect(limiting).toBe('potassium');
    });

    it('identifies iron as limiting when lowest', () => {
      const resources = createResources({
        nitrate: 15 * 40,
        phosphate: 1 * 40,
        potassium: 10 * 40,
        iron: 0, // Limiting
      });

      const limiting = getLimitingNutrient(resources, 40, 'java_fern');

      expect(limiting).toBe('iron');
    });

    it('defaults to nitrate for zero water volume', () => {
      const resources = createOptimalResources();

      const limiting = getLimitingNutrient(resources, 0, 'java_fern');

      expect(limiting).toBe('nitrate');
    });
  });
});
