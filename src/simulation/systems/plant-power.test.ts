import { describe, it, expect } from 'vitest';
import { getPlantPower } from './plant-power.js';
import type { Plant } from '../state.js';
import { GROWTH_FORMS } from '../plants/species.js';
import { LEAF_AREA_PER_RATE_UNIT, rateUnits } from '../plants/canopy.js';
import { plantRecord } from '../tests/plant.js';

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return plantRecord({
    id: 'p1',
    species: 'java_fern',
    size: 100,
    condition: 100,
    surplus: 0,
    ...overrides,
  });
}

describe('getPlantPower', () => {
  it('returns 0 for an empty list', () => {
    expect(getPlantPower([])).toBe(0);
  });

  it('counts a full thriving plant as its rate units: its leaf area over 500 cm²', () => {
    const { leafAreaIndex, footprintCm2 } = GROWTH_FORMS.rosette;
    const sword = makePlant({ species: 'amazon_sword', size: 100, condition: 100 });

    expect(getPlantPower([sword])).toBeCloseTo((leafAreaIndex * footprintCm2) / LEAF_AREA_PER_RATE_UNIT, 12);
  });

  it('a half-grown thriving plant counts half a full one', () => {
    const full = getPlantPower([makePlant({ size: 100, condition: 100 })]);
    expect(getPlantPower([makePlant({ size: 50, condition: 100 })])).toBeCloseTo(full / 2, 12);
  });

  it('a sick plant (condition 0) counts as 0', () => {
    expect(getPlantPower([makePlant({ size: 100, condition: 0 })])).toBe(0);
  });

  it('multiple plants sum their contributions', () => {
    const plants = [
      makePlant({ id: 'a', size: 100, condition: 100 }),
      makePlant({ id: 'b', size: 50, condition: 80 }),
      makePlant({ id: 'c', species: 'amazon_sword', size: 100, condition: 50 }),
    ];
    expect(getPlantPower(plants)).toBeCloseTo(
      plants.reduce((sum, p) => sum + getPlantPower([p]), 0),
      12
    );
    expect(getPlantPower([plants[2]])).toBeCloseTo(rateUnits(plants[2]) / 2, 12);
  });
});
