import { describe, it, expect } from 'vitest';
import {
  getDemandMultiplier,
  calculateNutrientSufficiency,
  updatePlantCondition,
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
  processPlantNutrients,
  calculateNutrientConsumption,
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

    it('uses Liebig\'s Law - returns minimum factor', () => {
      // All nutrients at optimal except iron at 50%
      const resources = createOptimalResources();
      resources.iron = 0.1 * 40; // 50% of optimal 0.2ppm

      const sufficiency = calculateNutrientSufficiency(resources, 40, 'dwarf_hairgrass');

      // Should be limited by iron (50%)
      expect(sufficiency).toBeCloseTo(0.5, 1);
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
  });

  describe('updatePlantCondition', () => {
    it('improves condition when thriving (sufficiency >= 0.8)', () => {
      const newCondition = updatePlantCondition(50, 0.9);

      expect(newCondition).toBe(50 + nutrientsDefaults.conditionRecoveryRate);
    });

    it('slowly improves condition when adequate (0.5-0.8)', () => {
      const newCondition = updatePlantCondition(50, 0.6);

      expect(newCondition).toBeCloseTo(50 + nutrientsDefaults.conditionRecoveryRate * 0.3, 1);
    });

    it('slowly degrades condition when struggling (0.2-0.5)', () => {
      const newCondition = updatePlantCondition(50, 0.3);

      expect(newCondition).toBeCloseTo(50 - nutrientsDefaults.conditionDecayRate * 0.5, 1);
    });

    it('rapidly degrades condition when starving (< 0.2)', () => {
      const newCondition = updatePlantCondition(50, 0.1);

      expect(newCondition).toBe(50 - nutrientsDefaults.conditionDecayRate);
    });

    it('clamps condition to maximum 100', () => {
      const newCondition = updatePlantCondition(99, 1.0);

      expect(newCondition).toBe(100);
    });

    it('clamps condition to minimum 0', () => {
      const newCondition = updatePlantCondition(1, 0);

      expect(newCondition).toBe(0);
    });

    it('uses custom config thresholds', () => {
      const customConfig = {
        ...nutrientsDefaults,
        thrivingThreshold: 0.5, // Lower threshold
        conditionRecoveryRate: 10,
      };

      const newCondition = updatePlantCondition(50, 0.6, customConfig);

      expect(newCondition).toBe(60); // Full recovery rate because 0.6 >= 0.5
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

  describe('calculateNutrientConsumption', () => {
    it('returns zeros when no plants', () => {
      const resources = createOptimalResources();

      const result = calculateNutrientConsumption(0, resources);

      expect(result.nitrateConsumed).toBe(0);
      expect(result.phosphateConsumed).toBe(0);
      expect(result.potassiumConsumed).toBe(0);
      expect(result.ironConsumed).toBe(0);
    });

    it('scales consumption with plant size', () => {
      const resources = createOptimalResources();

      const small = calculateNutrientConsumption(100, resources);
      const large = calculateNutrientConsumption(200, resources);

      expect(large.nitrateConsumed).toBe(small.nitrateConsumed * 2);
    });

    it('clamps consumption to available resources', () => {
      // Very low nutrients
      const resources = createResources({
        nitrate: 0.01,
        phosphate: 0.001,
        potassium: 0.01,
        iron: 0.0001,
      });

      const result = calculateNutrientConsumption(500, resources);

      expect(result.nitrateConsumed).toBeLessThanOrEqual(resources.nitrate);
      expect(result.phosphateConsumed).toBeLessThanOrEqual(resources.phosphate);
      expect(result.potassiumConsumed).toBeLessThanOrEqual(resources.potassium);
      expect(result.ironConsumed).toBeLessThanOrEqual(resources.iron);
    });

    it('consumes nutrients in fertilizer formula ratio', () => {
      const resources = createOptimalResources();

      const result = calculateNutrientConsumption(100, resources);

      // Check ratios match fertilizer formula (approximately)
      const total = result.nitrateConsumed + result.phosphateConsumed + result.potassiumConsumed + result.ironConsumed;
      if (total > 0) {
        const nitrateRatio = result.nitrateConsumed / total;
        const formulaTotal = 50 + 5 + 40 + 1; // default formula
        const expectedNitrateRatio = 50 / formulaTotal;
        expect(nitrateRatio).toBeCloseTo(expectedNitrateRatio, 1);
      }
    });
  });

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
