import { describe, it, expect } from 'vitest';
import { losePlant, tissueMass } from './plant-lifecycle.js';
import { plantsDefaults } from '../config/plants.js';
import { rateUnits } from '../plants/canopy.js';
import { tissuePerRateUnit } from './flora.js';
import type { Plant } from '../state.js';
import { plantRecord } from '../tests/plant.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return plantRecord({ id: 'test', species: 'java_fern', size: 100, condition: 100, surplus: 0, ...overrides });
}

describe('losePlant', () => {
  const plant = makePlant();
  const lost = (condition: number): number => plant.size - (losePlant({ ...plant, condition }).survivor?.size ?? 0);

  it('sheds nothing at full condition and the max rate at 0', () => {
    expect(lost(100)).toBe(0);
    expect(losePlant({ ...plant, condition: 0 }).shed).toBeCloseTo(
      tissueMass('java_fern', plant.size * plantsDefaults.maxSheddingRate),
      12
    );
  });

  it('follows the square of the condition deficit', () => {
    expect(lost(50)).toBeCloseTo(lost(1e-9) / 4, 6);
    expect(lost(90)).toBeCloseTo(lost(1e-9) / 100, 6);
  });

  it('is smooth in condition: no step anywhere, and flat as it leaves 100', () => {
    const top = plant.size * plantsDefaults.maxSheddingRate;
    let previous = lost(100);
    for (let condition = 99.9; condition > 0; condition -= 0.1) {
      const now = lost(condition);
      expect(now).toBeGreaterThan(previous);
      expect(now - previous).toBeLessThan(top * 0.0021);
      previous = now;
    }
    expect(lost(99.9) / top).toBeLessThan(1e-5);
  });

  it('takes a share of the plant, so a big one loses more of the tank', () => {
    const small = losePlant(makePlant({ size: 30, condition: 40 }));
    const large = losePlant(makePlant({ size: 90, condition: 40 }));
    expect(large.shed).toBeCloseTo(small.shed * 3, 12);
  });

  it('turns what it sheds into waste by the leaf it carried', () => {
    const { survivor: after, shed } = losePlant(makePlant({ condition: 20 }));
    expect(shed).toBeCloseTo(rateUnits({ species: 'java_fern', size: 100 - after!.size }) * tissuePerRateUnit(plantsDefaults), 12);
  });

  it('fouls the water more for a sword melting than a carpet patch, by their leaf', () => {
    const waste = (species: Plant['species']): number => losePlant(makePlant({ species, condition: 20 })).shed;
    expect(waste('amazon_sword') / waste('monte_carlo')).toBeCloseTo(
      rateUnits({ species: 'amazon_sword', size: 100 }) / rateUnits({ species: 'monte_carlo', size: 100 }),
      12
    );
  });

  it('kills a plant at condition 0, every gram of it to waste', () => {
    const { survivor: after, shed, died } = losePlant(makePlant({ size: 60, condition: 0 }));
    expect(after).toBeNull();
    expect(died).toBeGreaterThan(0);
    expect(shed + died).toBeCloseTo(tissueMass('java_fern', 60), 12);
  });

  it('keeps every gram a living plant holds: what is left and what is shed add up to what it was', () => {
    const { survivor: after, shed, died } = losePlant(makePlant({ size: 60, condition: 30 }));
    expect(died).toBe(0);
    expect(tissueMass('java_fern', after!.size) + shed).toBeCloseTo(tissueMass('java_fern', 60), 12);
  });
});
