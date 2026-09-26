import { describe, it, expect } from 'vitest';
import { calculateShedding, shouldPlantDie, calculateDeathWaste } from './plant-lifecycle.js';
import { plantsDefaults } from '../config/plants.js';
import type { Plant } from '../state.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return { id: 'test', species: 'java_fern', size: 100, condition: 100, surplus: 0, ...overrides };
}

describe('calculateShedding', () => {
  const plant = makePlant();
  const shed = (condition: number): number => calculateShedding({ ...plant, condition }).sizeReduction;

  it('sheds nothing at full condition and the max rate at 0', () => {
    expect(shed(100)).toBe(0);
    expect(shed(0)).toBeCloseTo(plant.size * plantsDefaults.maxSheddingRate, 12);
  });

  it('follows the square of the condition deficit', () => {
    expect(shed(50)).toBeCloseTo(shed(0) / 4, 12);
    expect(shed(90)).toBeCloseTo(shed(0) / 100, 12);
  });

  it('is smooth in condition: no step anywhere, and flat as it leaves 100', () => {
    let previous = shed(100);
    for (let condition = 99.9; condition >= 0; condition -= 0.1) {
      const now = shed(condition);
      expect(now).toBeGreaterThan(previous);
      expect(now - previous).toBeLessThan(shed(0) * 0.0021);
      previous = now;
    }
    expect(shed(99.9) / shed(0)).toBeLessThan(1e-5);
  });

  it('takes a share of the plant, so a big one loses more of the tank', () => {
    const small = calculateShedding({ ...plant, size: 50, condition: 40 });
    const large = calculateShedding({ ...plant, size: 150, condition: 40 });

    expect(large.sizeReduction).toBeCloseTo(small.sizeReduction * 3, 12);
  });

  it('turns what it sheds into waste in proportion', () => {
    const result = calculateShedding({ ...plant, condition: 20 });

    expect(result.wasteProduced).toBeCloseTo(result.sizeReduction * plantsDefaults.wastePerShedSize, 12);
  });
});

describe('shouldPlantDie', () => {
  it('kills a plant at condition 0 or with too little of it left', () => {
    expect(shouldPlantDie(makePlant({ size: 50, condition: 1 }))).toBe(false);
    expect(shouldPlantDie(makePlant({ size: 50, condition: 0 }))).toBe(true);
    expect(shouldPlantDie(makePlant({ size: 1, condition: 50 }))).toBe(true);
  });
});

describe('calculateDeathWaste', () => {
  it('scales with plant size', () => {
    const small = calculateDeathWaste(makePlant({ size: 50 }));
    const large = calculateDeathWaste(makePlant({ size: 150 }));

    expect(small).toBeGreaterThan(0);
    expect(large).toBe(small * 3);
  });
});
