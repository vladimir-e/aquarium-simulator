import { describe, it, expect } from 'vitest';
import {
  calculateShedding,
  shouldPlantDie,
  calculateDeathWaste,
  isPlantableSize,
} from './plant-lifecycle.js';
import { plantsDefaults } from '../config/plants.js';
import { fullRateUnits } from '../plants/canopy.js';
import type { Plant } from '../state.js';
import { plantRecord } from '../tests/plant.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return plantRecord({ id: 'test', species: 'java_fern', size: 100, condition: 100, surplus: 0, ...overrides });
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
    const small = calculateShedding({ ...plant, size: 30, condition: 40 });
    const large = calculateShedding({ ...plant, size: 90, condition: 40 });

    expect(large.sizeReduction).toBeCloseTo(small.sizeReduction * 3, 12);
  });

  it('turns what it sheds into waste by the leaf it carried', () => {
    const result = calculateShedding({ ...plant, condition: 20 });

    expect(result.wasteProduced).toBeCloseTo(
      result.sizeReduction * fullRateUnits('java_fern') * plantsDefaults.wastePerSize,
      12
    );
  });

  it('yields what the same tissue would leave dead: one conversion, whatever the route', () => {
    const { sizeReduction, wasteProduced } = calculateShedding({ ...plant, condition: 20 });

    expect(wasteProduced).toBeCloseTo(calculateDeathWaste({ ...plant, size: sizeReduction }), 12);
  });

  it('fouls the water more for a sword melting than a carpet patch, by their leaf', () => {
    const waste = (species: Plant['species']): number =>
      calculateShedding(makePlant({ species, condition: 20 })).wasteProduced;

    expect(waste('amazon_sword') / waste('monte_carlo')).toBeCloseTo(
      fullRateUnits('amazon_sword') / fullRateUnits('monte_carlo'),
      12
    );
  });
});

describe('shouldPlantDie', () => {
  it('kills a plant at condition 0 or with too little of it left', () => {
    const threshold = plantsDefaults.deathSizeThreshold;
    expect(shouldPlantDie(makePlant({ size: 50, condition: 1 }))).toBe(false);
    expect(shouldPlantDie(makePlant({ size: 50, condition: 0 }))).toBe(true);
    expect(shouldPlantDie(makePlant({ size: threshold, condition: 50 }))).toBe(false);
    expect(shouldPlantDie(makePlant({ size: threshold * 0.9, condition: 50 }))).toBe(true);
  });
});

describe('isPlantableSize', () => {
  it('admits a size with some tissue, up to a full unit, that the next tick would not retire, whatever the threshold', () => {
    for (const deathSizeThreshold of [-1, 0, 0.5, 5]) {
      const config = { ...plantsDefaults, deathSizeThreshold };
      for (const size of [-1, 0, 0.25, 0.5, 4.9, 5, 50, 100]) {
        const lives = size > 0 && !shouldPlantDie(makePlant({ size }), config);
        expect(isPlantableSize(size, config)).toBe(lives);
      }
      expect(isPlantableSize(100.5, config)).toBe(false);
      expect(isPlantableSize(NaN, config)).toBe(false);
    }
  });
});

describe('calculateDeathWaste', () => {
  it('scales with plant size', () => {
    const small = calculateDeathWaste(makePlant({ size: 30 }));
    const large = calculateDeathWaste(makePlant({ size: 90 }));

    expect(small).toBeGreaterThan(0);
    expect(large).toBeCloseTo(small * 3, 12);
  });

  it('leaves the leaf a plant carried: a full sword more than a full patch, by their rate units', () => {
    const left = (species: Plant['species']): number => calculateDeathWaste(makePlant({ species }));

    expect(left('amazon_sword') / left('monte_carlo')).toBeCloseTo(
      fullRateUnits('amazon_sword') / fullRateUnits('monte_carlo'),
      12
    );
  });
});
