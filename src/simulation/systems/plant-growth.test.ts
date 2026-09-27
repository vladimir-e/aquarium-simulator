import { describe, it, expect } from 'vitest';
import {
  spendSurplus,
  propagate,
  purchase,
  sizeBought,
  supply,
  getSpeciesGrowthRate,
} from './plant-growth.js';
import type { Plant } from '../state.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { plantsConfigMeta, plantsDefaults, type PlantsConfig } from '../config/plants.js';
import { plantRecord } from '../tests/plant.js';

function makePlant(
  species: PlantSpecies,
  overrides: Partial<Plant> = {}
): Plant {
  return plantRecord({
    id: `p_${species}`,
    species,
    size: 50,
    condition: 100,
    surplus: 0,
    ...overrides,
  });
}

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

  it('never withdraws more than the bank holds, at any rate a save can carry', () => {
    const maxTunable = plantsConfigMeta.find((knob) => knob.key === 'growthDrawRate')?.max;
    expect(maxTunable).toBeGreaterThan(plantsDefaults.growthDrawRate);

    for (const growthDrawRate of [maxTunable!, 1]) {
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

describe('propagate', () => {
  const CAP = plantsDefaults.surplusCap;
  const conversion = (species: PlantSpecies, config: PlantsConfig = plantsDefaults): number =>
    getSpeciesGrowthRate(species) * config.sizePerSurplus;

  it('fires iff the bank is at a cap above 0', () => {
    expect(propagate(makePlant('java_fern', { surplus: CAP }))).not.toBeNull();
    expect(propagate(makePlant('java_fern', { surplus: CAP - 1e-9 }))).toBeNull();
    const capless = { ...plantsDefaults, surplusCap: 0 };
    expect(propagate(makePlant('java_fern', { surplus: 0 }), capless)).toBeNull();
    expect(propagate(makePlant('java_fern', { surplus: 5 }), capless)).toBeNull();
  });

  it('buys an offshoot of the bank at the growth conversion, untapered, and the parent pays exactly that', () => {
    for (const species of Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]) {
      for (const size of [10, 80, 99]) {
        const plant = makePlant(species, { surplus: CAP, size });
        const { parent, offshootSize } = propagate(plant)!;
        expect(offshootSize).toBeCloseTo(Math.min(100, CAP * conversion(species)), 10);
        expect(parent.surplus + offshootSize / conversion(species)).toBeCloseTo(plant.surplus, 10);
        expect(parent.size).toBe(plant.size);
      }
    }
  });

  it('empties the bank on anything short of a full unit', () => {
    const { parent } = propagate(makePlant('monte_carlo', { surplus: CAP }))!;
    expect(parent.surplus).toBe(0);
  });

  it('caps the offshoot at a full unit and leaves the change in the bank', () => {
    const rich = { ...plantsDefaults, sizePerSurplus: 2 * (100 / (CAP * getSpeciesGrowthRate('monte_carlo'))) };
    const plant = makePlant('monte_carlo', { surplus: CAP });
    const { parent, offshootSize } = propagate(plant, rich)!;
    expect(offshootSize).toBe(100);
    expect(parent.surplus).toBeCloseTo(CAP / 2, 10);
    expect(parent.surplus + offshootSize / conversion('monte_carlo', rich)).toBeCloseTo(plant.surplus, 10);
  });

  it('buys a full unit at most, never overdrawing the bank, anywhere on the drawer grid', () => {
    const { min, max, step } = plantsConfigMeta.find((knob) => knob.key === 'sizePerSurplus')!;
    const grid = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) =>
      Number((min + i * step).toFixed(6))
    );
    for (const species of Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]) {
      for (const sizePerSurplus of grid) {
        const config = { ...plantsDefaults, sizePerSurplus };
        const worth = CAP * conversion(species, config);
        const { parent, offshootSize } = propagate(makePlant(species, { surplus: CAP }), config)!;
        expect(offshootSize).toBeLessThanOrEqual(100);
        expect(offshootSize).toBeCloseTo(Math.min(100, worth), 9);
        expect(parent.surplus).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('purchase', () => {
  const CAP = plantsDefaults.surplusCap;

  it('buys a full bank its offshoot first, then growth on what is left', () => {
    const plant = makePlant('monte_carlo', { surplus: CAP, size: 30 });
    const { parent, offshootSize } = propagate(plant)!;
    const bought = purchase(plant);
    expect(bought.offshootSize).toBe(offshootSize);
    expect(bought.after).toEqual(spendSurplus(parent));
    expect(sizeBought(bought)).toBeCloseTo(offshootSize + spendSurplus(parent).size - plant.size, 12);
  });

  it('buys growth alone short of the cap', () => {
    const plant = makePlant('java_fern', { surplus: 10, size: 30 });
    expect(purchase(plant)).toEqual({ before: plant, after: spendSurplus(plant), offshootSize: 0 });
  });
});

describe('supply', () => {
  const CAP = plantsDefaults.surplusCap;
  const conversion = (species: PlantSpecies): number =>
    getSpeciesGrowthRate(species) * plantsDefaults.sizePerSurplus;

  it('scales size, offshoot and price together, so the bank pays for exactly the tissue it got', () => {
    for (const species of Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]) {
      for (const surplus of [10, CAP]) {
        const bought = purchase(makePlant(species, { surplus, size: 30 }));
        for (const share of [0, 0.3, 1]) {
          const got = supply(bought, share);
          const paid = bought.before.surplus - got.after.surplus;
          expect(sizeBought(got)).toBeCloseTo(share * sizeBought(bought), 12);
          expect(sizeBought(got)).toBeCloseTo(paid * conversion(species), 10);
        }
      }
    }
  });

  it('delivers the purchase whole at full supply, and nothing at none', () => {
    const bought = purchase(makePlant('amazon_sword', { surplus: CAP, size: 30 }));
    const whole = supply(bought, 1);
    expect(whole.after.size).toBeCloseTo(bought.after.size, 12);
    expect(whole.after.surplus).toBeCloseTo(bought.after.surplus, 12);
    expect(whole.offshootSize).toBe(bought.offshootSize);
    const none = supply(bought, 0);
    expect(none.after.size).toBe(bought.before.size);
    expect(none.after.surplus).toBe(bought.before.surplus);
    expect(none.offshootSize).toBe(0);
  });
});
