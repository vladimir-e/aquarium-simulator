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
    const plant: Plant = { id: 'test', species: 'java_fern', size: 100, condition: 100 };

    it('sheds nothing from a plant paying its whole bill, whatever its condition', () => {
      for (const condition of [100, 50, 15, 0]) {
        const result = calculateShedding({ ...plant, condition }, 0);

        expect(result.sizeReduction).toBe(0);
        expect(result.wasteProduced).toBe(0);
      }
    });

    it('sheds harder the more of the bill is left standing', () => {
      let previous = 0;
      for (const starved of [0.1, 0.25, 0.5, 0.75, 1]) {
        const { sizeReduction } = calculateShedding(plant, starved);
        expect(sizeReduction).toBeGreaterThan(previous);
        previous = sizeReduction;
      }
    });

    it('sheds the max rate from a plant paying none of it', () => {
      expect(calculateShedding(plant, 1).sizeReduction).toBeCloseTo(
        plant.size * plantsDefaults.maxSheddingRate,
        5
      );
    });

    it('takes a share of the plant, so a big one loses more of the tank', () => {
      const small = calculateShedding({ ...plant, size: 50 }, 1);
      const large = calculateShedding({ ...plant, size: 150 }, 1);

      expect(large.sizeReduction).toBe(small.sizeReduction * 3);
    });

    it('waste scales with size reduction', () => {
      const result = calculateShedding(plant, 1);

      expect(result.wasteProduced).toBeCloseTo(
        result.sizeReduction * plantsDefaults.wastePerShedSize,
        5
      );
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
