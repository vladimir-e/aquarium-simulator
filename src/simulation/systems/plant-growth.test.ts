import { describe, it, expect } from 'vitest';
import {
  spendSurplusOnGrowth,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from './plant-growth.js';
import type { Plant, PlantSpecies } from '../state.js';
import { plantsDefaults } from '../config/plants.js';

function makePlant(
  species: PlantSpecies,
  overrides: Partial<Plant> = {}
): Plant {
  return {
    id: `p_${species}`,
    species,
    size: 50,
    condition: 100,
    surplus: 0,
    ...overrides,
  };
}

describe('asymptoticGrowthFactor', () => {
  it('returns 1.0 at size 0', () => {
    expect(asymptoticGrowthFactor(0, 100)).toBe(1);
  });

  it('returns 0 at maxSize', () => {
    expect(asymptoticGrowthFactor(100, 100)).toBe(0);
  });

  it('clamps to 0 above maxSize', () => {
    expect(asymptoticGrowthFactor(150, 100)).toBe(0);
  });

  it('decays linearly between 0 and maxSize', () => {
    expect(asymptoticGrowthFactor(25, 100)).toBe(0.75);
    expect(asymptoticGrowthFactor(50, 100)).toBe(0.5);
    expect(asymptoticGrowthFactor(75, 100)).toBe(0.25);
  });

  it('returns 0 when maxSize is 0', () => {
    expect(asymptoticGrowthFactor(50, 0)).toBe(0);
  });
});

describe('getSpeciesGrowthRate', () => {
  it('returns the species-level growth rate', () => {
    expect(getSpeciesGrowthRate('anubias')).toBe(0.3);
    expect(getSpeciesGrowthRate('java_fern')).toBe(0.5);
    expect(getSpeciesGrowthRate('amazon_sword')).toBe(1.0);
    expect(getSpeciesGrowthRate('dwarf_hairgrass')).toBe(1.5);
    expect(getSpeciesGrowthRate('monte_carlo')).toBe(1.8);
  });
});

describe('getSpeciesMaxSize', () => {
  it('returns the species-level maxSize', () => {
    // Sanity: monte_carlo cap > anubias cap by design.
    expect(getSpeciesMaxSize('monte_carlo')).toBeGreaterThan(
      getSpeciesMaxSize('anubias')
    );
  });
});

describe('spendSurplusOnGrowth', () => {
  it('returns the plant unchanged when surplus is 0', () => {
    const plant = makePlant('java_fern', { surplus: 0, size: 50 });
    const after = spendSurplusOnGrowth(plant);
    expect(after.size).toBe(50);
    expect(after.surplus).toBe(0);
  });

  it('returns the plant unchanged when surplus is negative (defensive)', () => {
    const plant = makePlant('java_fern', { surplus: -1, size: 50 });
    const after = spendSurplusOnGrowth(plant);
    expect(after).toBe(plant); // identity-equal — early return
  });

  it('drains the cap from a high bank, not the whole bank', () => {
    const plant = makePlant('java_fern', {
      surplus: plantsDefaults.plantGrowthPerTickCap * 5,
      size: 0, // factor = 1 at size 0
    });
    const after = spendSurplusOnGrowth(plant);
    expect(after.surplus).toBe(plant.surplus - plantsDefaults.plantGrowthPerTickCap);
  });

  it('drains the entire bank when below the cap', () => {
    const plant = makePlant('java_fern', {
      surplus: 0.5,
      size: 0,
    });
    const after = spendSurplusOnGrowth(plant);
    expect(after.surplus).toBe(0);
  });

  it('size gain = drained × asymptoticFactor × speciesRate × sizePerSurplus', () => {
    const plant = makePlant('java_fern', { surplus: 1.0, size: 0 });
    const after = spendSurplusOnGrowth(plant);
    const expected =
      1.0 *
      asymptoticGrowthFactor(0, getSpeciesMaxSize('java_fern')) *
      getSpeciesGrowthRate('java_fern') *
      plantsDefaults.sizePerSurplus;
    expect(after.size).toBeCloseTo(expected, 10);
  });

  it('faster species grow more from the same surplus and size', () => {
    const surplus = 2.0;
    const slow = spendSurplusOnGrowth(makePlant('anubias', { surplus, size: 50 }));
    const fast = spendSurplusOnGrowth(makePlant('monte_carlo', { surplus, size: 50 }));
    expect(fast.size - 50).toBeGreaterThan(slow.size - 50);
  });

  it('asymptotic factor reduces spending efficiency near maxSize', () => {
    // Same species, same surplus, two sizes — larger size yields less growth.
    const small = spendSurplusOnGrowth(
      makePlant('java_fern', { surplus: 1.0, size: 10 })
    );
    const large = spendSurplusOnGrowth(
      makePlant('java_fern', { surplus: 1.0, size: getSpeciesMaxSize('java_fern') * 0.9 })
    );
    expect(small.size - 10).toBeGreaterThan(
      large.size - getSpeciesMaxSize('java_fern') * 0.9
    );
  });

  it('drains surplus at full rate even when size is near maxSize', () => {
    // Per spec: asymptotic factor reduces spending *efficiency*, not
    // withdrawal amount. A plant at 90 % of maxSize still drains the
    // cap from its bank — it just gets less size for the spend.
    const plant = makePlant('java_fern', {
      surplus: plantsDefaults.plantGrowthPerTickCap * 5,
      size: getSpeciesMaxSize('java_fern') * 0.9,
    });
    const after = spendSurplusOnGrowth(plant);
    expect(after.surplus).toBe(plant.surplus - plantsDefaults.plantGrowthPerTickCap);
  });

  it('a plant at maxSize gains zero size from surplus but still drains the bank', () => {
    const plant = makePlant('java_fern', {
      surplus: 5.0,
      size: getSpeciesMaxSize('java_fern'),
    });
    const after = spendSurplusOnGrowth(plant);
    expect(after.size).toBe(plant.size); // factor = 0 → no growth
    expect(after.surplus).toBe(plant.surplus - plantsDefaults.plantGrowthPerTickCap);
  });
});
