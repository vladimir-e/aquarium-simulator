import { describe, it, expect } from 'vitest';
import {
  spendSurplus,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
} from './plant-growth.js';
import { computeVitality, type VitalityResult } from './vitality.js';
import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { plantsConfigMeta, plantsDefaults } from '../config/plants.js';

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
  return plant.surplus - spendSurplus(plant, 0).surplus;
}

/** The size a spend delivered. */
function growth(plant: Plant): number {
  return spendSurplus(plant, 0).size - plant.size;
}

describe('spendSurplus', () => {
  it('returns the plant unchanged when surplus is 0', () => {
    const plant = makePlant('java_fern', { surplus: 0, size: 50 });
    const after = spendSurplus(plant, 0);
    expect(after.size).toBe(50);
    expect(after.surplus).toBe(0);
  });

  it('returns the plant unchanged when surplus is negative (defensive)', () => {
    const plant = makePlant('java_fern', { surplus: -1, size: 50 });
    const after = spendSurplus(plant, 0);
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
    expect(spendSurplus(plant, 0).surplus).toBeGreaterThan(0);
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
    const after = spendSurplus(plant, 0);
    expect(after.size).toBe(plant.size);
    expect(after.surplus).toBe(plant.surplus);
  });

  /**
   * At size 0 the asymptotic factor is 1, so the withdrawal is the whole draw
   * rate against the whole bank — the largest one the shape can produce. The
   * default rate makes that 2 % and the claim trivial; a config is not pinned
   * to the default. The tuner reaches 0.2, and the persistence schema takes any
   * finite number, so a restored save can hand this a rate above 1.
   */
  it('never withdraws more than the bank holds, at any rate a config can carry', () => {
    const maxTunable = plantsConfigMeta.find((knob) => knob.key === 'growthDrawRate')?.max;
    expect(maxTunable).toBeGreaterThan(plantsDefaults.growthDrawRate);

    for (const growthDrawRate of [maxTunable!, 1, 1.5, 100]) {
      const plant = makePlant('monte_carlo', { surplus: plantsDefaults.surplusCap, size: 0 });
      const after = spendSurplus(plant, 0, { ...plantsDefaults, growthDrawRate });
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

/**
 * The bank serves two claims in an order, and the spend is the junior one.
 * Damage stops at the survival rations and takes condition instead; if repair
 * could reach under that line it would hand the condition straight back out of
 * the rations, and the plant would starve a tick later having paid twice for
 * one bad hour. Driven through `computeVitality` rather than asserted on
 * `spendSurplus` alone, because the defect lived in the seam between them.
 */
describe('the reserved depth, against repair and growth', () => {
  const UPKEEP_RATE = 0.05;
  const RESERVE_HOURS = 100;
  const RESERVE = UPKEEP_RATE * RESERVE_HOURS;

  /** One tick of a plant that earns its upkeep exactly and is damaged on top. */
  const settle = (plant: Plant): VitalityResult =>
    computeVitality({
      upkeep: [{ key: 'upkeep', label: 'Upkeep', amount: UPKEEP_RATE }],
      upkeepReserveHours: RESERVE_HOURS,
      stressors: [{ key: 'stress', label: 'Stress', amount: 0.5 }],
      benefits: [{ key: 'light', label: 'Light', amount: UPKEEP_RATE }],
      hardiness: 0,
      condition: plant.condition,
      surplus: plant.surplus,
      surplusCap: plantsDefaults.surplusCap,
    });

  it('damage takes the condition, and the next tick may not buy it back', () => {
    const plant = makePlant('java_fern', { surplus: RESERVE, size: 200 });
    const hit = settle(plant);

    expect(hit.breakdown.reserved).toBeCloseTo(RESERVE, 10);
    expect(hit.surplus).toBeCloseTo(RESERVE, 10);
    expect(hit.newCondition).toBeLessThan(100);

    const damaged: Plant = { ...plant, condition: hit.newCondition, surplus: hit.surplus };
    const next = spendSurplus(damaged, hit.breakdown.reserved);
    expect(next.condition).toBe(damaged.condition);
    expect(next.surplus).toBe(damaged.surplus);
    expect(next.size).toBe(damaged.size);

    // Without the floor the rations pay the condition back within the hour,
    // which is the defect and what keeps the assertions above from passing
    // on an empty bank.
    expect(spendSurplus(damaged, 0).condition).toBeGreaterThan(damaged.condition);
  });

  it('spends the whole spare on the ladder and stops at the line', () => {
    const plant = makePlant('java_fern', { surplus: RESERVE + 4, size: 200, condition: 99 });
    let running = plant;
    for (let hour = 0; hour < 2000; hour++) {
      running = spendSurplus(running, RESERVE);
    }
    expect(running.condition).toBe(100);
    expect(running.size).toBeGreaterThan(plant.size);
    expect(running.surplus).toBeCloseTo(RESERVE, 6);
  });
});
