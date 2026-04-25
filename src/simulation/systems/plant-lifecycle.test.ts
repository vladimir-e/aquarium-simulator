import { describe, it, expect } from 'vitest';
import {
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
} from './plant-lifecycle.js';
import { plantsDefaults } from '../config/plants.js';
import type { Plant } from '../state.js';

describe('plant lifecycle', () => {
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

      const expectedSizeReduction = 100 * plantsDefaults.maxSheddingRate;
      expect(result.sizeReduction).toBeCloseTo(expectedSizeReduction, 5);
    });

    it('waste scales with size reduction', () => {
      const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 0 };

      const result = calculateShedding(plant);

      const expectedWaste = result.sizeReduction * plantsDefaults.wastePerShedSize;
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

      expect(waste).toBe(100 * plantsDefaults.wastePerPlantDeath);
    });

    it('scales with plant size', () => {
      const smallPlant: Plant = { id: '1', species: 'java_fern', size: 50, condition: 5 };
      const largePlant: Plant = { id: '2', species: 'java_fern', size: 150, condition: 5 };

      const smallWaste = calculateDeathWaste(smallPlant);
      const largeWaste = calculateDeathWaste(largePlant);

      expect(largeWaste).toBe(smallWaste * 3);
    });
  });
});
