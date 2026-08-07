import { describe, it, expect } from 'vitest';
import {
  spendSurplusOnGrowth,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from './plant-growth.js';
import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
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

/** What the bank paid for the size a spend delivered. */
function withdrawal(plant: Plant): number {
  return plant.surplus - spendSurplusOnGrowth(plant).surplus;
}

/** The size a spend delivered. */
function growth(plant: Plant): number {
  return spendSurplusOnGrowth(plant).size - plant.size;
}

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

  it('the withdrawal buys the growth and nothing else', () => {
    const plant = makePlant('java_fern', { surplus: 20, size: 300 });
    const rate = getSpeciesGrowthRate('java_fern') * plantsDefaults.sizePerSurplus;
    expect(growth(plant)).toBeCloseTo(withdrawal(plant) * rate, 10);
  });

  it('leaves the rest of the bank alone', () => {
    const plant = makePlant('java_fern', { surplus: 20, size: 300 });
    expect(withdrawal(plant)).toBeLessThan(plant.surplus);
    expect(spendSurplusOnGrowth(plant).surplus).toBeGreaterThan(0);
  });

  it('size gain = surplus × growthDrawRate × asymptoticFactor × speciesRate × sizePerSurplus', () => {
    const plant = makePlant('java_fern', { surplus: 10, size: 200 });
    const expected =
      10 *
      plantsDefaults.growthDrawRate *
      asymptoticGrowthFactor(200, getSpeciesMaxSize('java_fern')) *
      getSpeciesGrowthRate('java_fern') *
      plantsDefaults.sizePerSurplus;
    expect(growth(plant)).toBeCloseTo(expected, 10);
  });

  it('doubling the bank doubles both the growth and the withdrawal', () => {
    const lean = makePlant('java_fern', { surplus: 5, size: 200 });
    const fat = makePlant('java_fern', { surplus: 10, size: 200 });
    expect(growth(fat)).toBeCloseTo(growth(lean) * 2, 10);
    expect(withdrawal(fat)).toBeCloseTo(withdrawal(lean) * 2, 10);
  });

  it('faster species grow more from the same surplus and size', () => {
    const surplus = 10;
    expect(growth(makePlant('monte_carlo', { surplus, size: 50 }))).toBeGreaterThan(
      growth(makePlant('anubias', { surplus, size: 50 }))
    );
  });

  it('costs the same bank whatever the species does with it', () => {
    // The asymptotic share is what leaves the bank; the species rate only
    // decides how much size it buys. Same size fraction, same withdrawal.
    const surplus = 10;
    const slow = makePlant('anubias', { surplus, size: getSpeciesMaxSize('anubias') * 0.5 });
    const fast = makePlant('monte_carlo', {
      surplus,
      size: getSpeciesMaxSize('monte_carlo') * 0.5,
    });
    expect(withdrawal(fast)).toBeCloseTo(withdrawal(slow), 10);
  });

  it('a plant near maxSize grows less and pays less for it', () => {
    const surplus = 10;
    const small = makePlant('java_fern', { surplus, size: 10 });
    const large = makePlant('java_fern', {
      surplus,
      size: getSpeciesMaxSize('java_fern') * 0.9,
    });
    expect(growth(large)).toBeLessThan(growth(small));
    expect(withdrawal(large)).toBeLessThan(withdrawal(small));
  });

  it('a plant at maxSize keeps its whole bank instead of burning it', () => {
    const plant = makePlant('java_fern', {
      surplus: 25,
      size: getSpeciesMaxSize('java_fern'),
    });
    const after = spendSurplusOnGrowth(plant);
    expect(after.size).toBe(plant.size);
    expect(after.surplus).toBe(plant.surplus);
  });

  it('never withdraws more than the bank holds', () => {
    const plant = makePlant('monte_carlo', {
      surplus: plantsDefaults.surplusCap,
      size: 0, // factor = 1 — the largest draw a bank of this size can fund
    });
    expect(spendSurplusOnGrowth(plant).surplus).toBeGreaterThan(0);
  });
});
