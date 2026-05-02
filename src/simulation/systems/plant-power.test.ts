/**
 * Tests for the shared `getPlantPower` helper.
 *
 * Used by both fish vitality (shelter benefit) and algae vitality
 * (suppression stressor + low_plant_power benefit). Linear in
 * size × condition.
 */

import { describe, it, expect } from 'vitest';
import { getPlantPower } from './plant-power.js';
import type { Plant, PlantSpecies } from '../state.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 'p1',
    species: 'java_fern' as PlantSpecies,
    size: 100,
    condition: 100,
    surplus: 0,
    ...overrides,
  };
}

describe('getPlantPower', () => {
  it('returns 0 for an empty list', () => {
    expect(getPlantPower([])).toBe(0);
  });

  it('a full-grown thriving plant counts as 1.0', () => {
    expect(getPlantPower([makePlant({ size: 100, condition: 100 })])).toBe(1.0);
  });

  it('a half-grown thriving plant counts as 0.5', () => {
    expect(getPlantPower([makePlant({ size: 50, condition: 100 })])).toBe(0.5);
  });

  it('a sick plant (condition 0) counts as 0', () => {
    expect(getPlantPower([makePlant({ size: 100, condition: 0 })])).toBe(0);
  });

  it('an overgrown thriving plant scales linearly past 100%', () => {
    expect(getPlantPower([makePlant({ size: 300, condition: 100 })])).toBe(3.0);
  });

  it('multiple plants sum their contributions', () => {
    const plants = [
      makePlant({ id: 'a', size: 100, condition: 100 }),
      makePlant({ id: 'b', size: 50, condition: 80 }),
      makePlant({ id: 'c', size: 200, condition: 50 }),
    ];
    // 1.0 + 0.4 + 1.0 = 2.4
    expect(getPlantPower(plants)).toBeCloseTo(2.4, 6);
  });
});
