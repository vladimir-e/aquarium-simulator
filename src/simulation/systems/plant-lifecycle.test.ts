import { describe, it, expect } from 'vitest';
import { calculateShedding, shouldPlantDie, calculateDeathWaste } from './plant-lifecycle.js';
import { plantsDefaults } from '../config/plants.js';
import type { Plant } from '../state.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return { id: 'test', species: 'java_fern', size: 100, condition: 100, surplus: 0, ...overrides };
}

describe('calculateShedding', () => {
  const plant = makePlant();

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
      10
    );
  });

  it('takes a share of the plant, so a big one loses more of the tank', () => {
    const small = calculateShedding({ ...plant, size: 50 }, 1);
    const large = calculateShedding({ ...plant, size: 150 }, 1);

    expect(large.sizeReduction).toBe(small.sizeReduction * 3);
  });

  it('turns what it sheds into waste in proportion', () => {
    const result = calculateShedding(plant, 1);

    expect(result.wasteProduced).toBeCloseTo(
      result.sizeReduction * plantsDefaults.wastePerShedSize,
      10
    );
  });
});

describe('shouldPlantDie', () => {
  it('kills a plant whose condition or size falls under the line', () => {
    expect(shouldPlantDie(makePlant({ size: 50, condition: 50 }))).toBe(false);
    expect(shouldPlantDie(makePlant({ size: 50, condition: 1 }))).toBe(true);
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
