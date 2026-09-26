import { describe, it, expect } from 'vitest';
import { spendSurplus, getSpeciesGrowthRate, growthTaper } from './plant-growth.js';
import type { Plant } from '../state.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { plantsConfigMeta, plantsDefaults, type PlantsConfig } from '../config/plants.js';

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

describe('growthTaper', () => {
  it('is whole at size 0 and closed at a full unit', () => {
    expect(growthTaper(0)).toBe(1);
    expect(growthTaper(100)).toBe(0);
  });

  it('closes linearly in between', () => {
    expect(growthTaper(25)).toBe(0.75);
    expect(growthTaper(75)).toBe(0.25);
  });
});

function withdrawal(plant: Plant): number {
  return plant.surplus - spendSurplus(plant).surplus;
}

function growth(plant: Plant): number {
  return spendSurplus(plant).size - plant.size;
}

describe('spendSurplus', () => {
  it('returns the plant unchanged when surplus is 0', () => {
    const plant = makePlant('java_fern', { surplus: 0, size: 50 });
    const after = spendSurplus(plant);
    expect(after.size).toBe(50);
    expect(after.surplus).toBe(0);
  });

  it('returns the plant unchanged when surplus is negative (defensive)', () => {
    const plant = makePlant('java_fern', { surplus: -1, size: 50 });
    const after = spendSurplus(plant);
    expect(after).toBe(plant);
  });

  it('grows whatever the condition: the bank buys size alongside healing', () => {
    const well = makePlant('java_fern', { surplus: 10, size: 60 });
    const hurt = makePlant('java_fern', { surplus: 10, size: 60, condition: 40 });
    expect(growth(hurt)).toBeCloseTo(growth(well), 12);
    expect(spendSurplus(hurt).condition).toBe(40);
  });

  it('the withdrawal buys the growth and nothing else', () => {
    const plant = makePlant('java_fern', { surplus: 20, size: 80 });
    const rate = getSpeciesGrowthRate('java_fern') * plantsDefaults.sizePerSurplus;
    expect(growth(plant)).toBeCloseTo(withdrawal(plant) * rate, 10);
  });

  it('leaves the rest of the bank alone', () => {
    const plant = makePlant('java_fern', { surplus: 20, size: 80 });
    expect(withdrawal(plant)).toBeLessThan(plant.surplus);
    expect(spendSurplus(plant).surplus).toBeGreaterThan(0);
  });

  it('size gain = surplus × growthDrawRate × (1 − size/100) × speciesRate × sizePerSurplus', () => {
    const plant = makePlant('java_fern', { surplus: 10, size: 60 });
    const expected =
      10 *
      plantsDefaults.growthDrawRate *
      (1 - 60 / 100) *
      getSpeciesGrowthRate('java_fern') *
      plantsDefaults.sizePerSurplus;
    expect(growth(plant)).toBeCloseTo(expected, 10);
  });

  it('doubling the bank doubles both the growth and the withdrawal', () => {
    const lean = makePlant('java_fern', { surplus: 5, size: 60 });
    const fat = makePlant('java_fern', { surplus: 10, size: 60 });
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
    const surplus = 10;
    const slow = makePlant('anubias', { surplus, size: 50 });
    const fast = makePlant('monte_carlo', { surplus, size: 50 });
    expect(withdrawal(fast)).toBeCloseTo(withdrawal(slow), 10);
  });

  it('a plant nearer full grows less and pays less for it', () => {
    const surplus = 10;
    const small = makePlant('java_fern', { surplus, size: 10 });
    const large = makePlant('java_fern', { surplus, size: 90 });
    expect(growth(large)).toBeLessThan(growth(small));
    expect(withdrawal(large)).toBeLessThan(withdrawal(small));
  });

  it('a full plant keeps its whole bank instead of burning it', () => {
    const plant = makePlant('java_fern', { surplus: 25, size: 100 });
    const after = spendSurplus(plant);
    expect(after.size).toBe(plant.size);
    expect(after.surplus).toBe(plant.surplus);
  });

  it('buys at most 0.72 of what is left to a full unit in a tick, so never reaches it, at any bound the tunables allow', () => {
    const bound = (key: keyof PlantsConfig): number =>
      plantsConfigMeta.find((knob) => knob.key === key)!.max;
    const config: PlantsConfig = {
      ...plantsDefaults,
      growthDrawRate: bound('growthDrawRate'),
      sizePerSurplus: bound('sizePerSurplus'),
    };
    const fastest = (Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]).reduce((a, b) =>
      getSpeciesGrowthRate(a) > getSpeciesGrowthRate(b) ? a : b
    );

    for (const size of [0, 50, 99, 99.999]) {
      const plant = makePlant(fastest, { surplus: bound('surplusCap'), size });
      const after = spendSurplus(plant, config);
      expect(after.size - size).toBeLessThanOrEqual(0.72 * (100 - size) + 1e-9);
      expect(after.size).toBeLessThan(100);
    }
  });

  it('never withdraws more than the bank holds, at any rate a config can carry', () => {
    const maxTunable = plantsConfigMeta.find((knob) => knob.key === 'growthDrawRate')?.max;
    expect(maxTunable).toBeGreaterThan(plantsDefaults.growthDrawRate);

    for (const growthDrawRate of [maxTunable!, 1, 1.5, 100]) {
      const plant = makePlant('monte_carlo', { surplus: plantsDefaults.surplusCap, size: 0 });
      const after = spendSurplus(plant, { ...plantsDefaults, growthDrawRate });
      expect(after.surplus).toBeGreaterThanOrEqual(0);
      expect(after.size - plant.size).toBeCloseTo(
        (plant.surplus - after.surplus) *
          getSpeciesGrowthRate('monte_carlo') *
          plantsDefaults.sizePerSurplus,
        10
      );
    }
  });
});
