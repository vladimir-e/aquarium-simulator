import { describe, it, expect } from 'vitest';
import { processMetabolism } from './metabolism.js';
import { livestockDefaults } from '../config/livestock.js';
import { MW_CO2, MW_N, MW_NH3, MW_O2 } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';
import type { Fish } from '../state.js';

const AMPLE_O2 = 8;

const AMPLE_FACTOR = monodFactor(
  AMPLE_O2,
  livestockDefaults.respirationOxygenHalfSaturation
);

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 50,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

describe('processMetabolism', () => {
  it('returns empty results for no fish', () => {
    const result = processMetabolism([], 5, AMPLE_O2, livestockDefaults);
    expect(result.updatedFish).toHaveLength(0);
    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
    expect(result.oxygenConsumedMg).toBe(0);
    expect(result.co2ProducedMg).toBe(0);
  });

  it('eats in proportion to mass and to how empty the fish is', () => {
    const eaten = (mass: number, satiation: number): number =>
      processMetabolism([makeFish({ mass, satiation })], 10, AMPLE_O2, livestockDefaults)
        .foodConsumed;

    expect(eaten(1, 50)).toBeGreaterThan(0);
    expect(eaten(2, 50)).toBeCloseTo(2 * eaten(1, 50), 10);
    expect(eaten(1, 0)).toBeCloseTo(2 * eaten(1, 50), 10);
  });

  it('does not consume more food than available', () => {
    const fish = [makeFish({ satiation: 0, mass: 10 })];
    const availableFood = 0.001;
    const result = processMetabolism(fish, availableFood, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBeLessThanOrEqual(availableFood);
  });

  it('raises satiation when food is consumed', () => {
    const fish = [makeFish({ satiation: 20, mass: 1.0 })];
    const result = processMetabolism(fish, 100, AMPLE_O2, livestockDefaults);

    expect(result.updatedFish[0].satiation).toBeGreaterThan(20);
  });

  it('caps satiation at 100', () => {
    const fish = [makeFish({ satiation: 0, mass: 1 })];
    const result = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);

    expect(result.updatedFish[0].satiation).toBeLessThanOrEqual(100);
  });

  it('caps satiation at 0 minimum', () => {
    const fish = [makeFish({ satiation: 0, mass: 1.0 })];
    const result = processMetabolism(fish, 0, AMPLE_O2, livestockDefaults);

    expect(result.updatedFish[0].satiation).toBeGreaterThanOrEqual(0);
  });

  it('splits food nitrogen between direct gill NH3 and feces-bound waste', () => {
    const fish = [makeFish({ satiation: 50, mass: 2.0 })];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBeGreaterThan(0);
    expect(result.wasteProduced).toBeGreaterThan(0);
    expect(result.ammoniaProduced).toBeGreaterThan(0);

    const expectedWaste = result.foodConsumed * (1 - livestockDefaults.gillNFraction);
    expect(result.wasteProduced).toBeCloseTo(expectedWaste, 8);

    const postPrandial =
      result.foodConsumed *
      livestockDefaults.foodNitrogenFraction *
      livestockDefaults.gillNFraction *
      (MW_NH3 / MW_N) *
      1000;
    const basal = livestockDefaults.basalAmmoniaRate * 2.0;
    expect(result.ammoniaProduced).toBeCloseTo((postPrandial + basal) * AMPLE_FACTOR, 6);
  });

  it('still produces basal gill NH3 when no food is eaten', () => {
    const fish = [makeFish({ satiation: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 0, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    expect(result.ammoniaProduced).toBeCloseTo(
      livestockDefaults.basalAmmoniaRate * 1.0 * AMPLE_FACTOR,
      6
    );
  });

  it('conserves food-derived nitrogen exactly when waste ratio matches stoichiometry', () => {
    const mass = 10;
    const fish = [makeFish({ satiation: 0, mass })];
    let totalFood = 0;
    let totalDirectNH3 = 0;
    let totalWaste = 0;
    const ticks = 24;
    for (let t = 0; t < ticks; t++) {
      const r = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);
      totalFood += r.foodConsumed;
      totalDirectNH3 += r.ammoniaProduced;
      totalWaste += r.wasteProduced;
    }

    const basalNH3 = livestockDefaults.basalAmmoniaRate * mass * ticks * AMPLE_FACTOR;
    const foodDerivedNH3 = totalDirectNH3 - basalNH3;

    const nIngested = totalFood * livestockDefaults.foodNitrogenFraction;
    const nDirect = foodDerivedNH3 / ((MW_NH3 / MW_N) * 1000);
    const stoichRatio = livestockDefaults.foodNitrogenFraction * (MW_NH3 / MW_N) * 1000;
    const nWaste = (totalWaste * stoichRatio) / ((MW_NH3 / MW_N) * 1000);
    const nKept = nIngested * livestockDefaults.gillNFraction * (1 - AMPLE_FACTOR);

    expect(nDirect + nWaste + nKept).toBeCloseTo(nIngested, 10);
  });

  it('consumes oxygen based on mass, and on the oxygen there is to take', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);

    expect(result.oxygenConsumedMg).toBeCloseTo(
      livestockDefaults.baseRespirationRate *
        2.0 *
        monodFactor(AMPLE_O2, livestockDefaults.respirationOxygenHalfSaturation),
      6
    );
  });

  it('takes up half its base rate at the half-saturation constant', () => {
    const result = processMetabolism(
      [makeFish({ mass: 2.0 })],
      10,
      livestockDefaults.respirationOxygenHalfSaturation,
      livestockDefaults
    );

    expect(result.oxygenConsumedMg).toBeCloseTo(livestockDefaults.baseRespirationRate * 2.0 * 0.5, 9);
  });

  it('takes nothing from water with none in it, and exhales nothing either', () => {
    const result = processMetabolism([makeFish({ mass: 2.0 })], 10, 0, livestockDefaults);

    expect(result.oxygenConsumedMg).toBe(0);
    expect(result.co2ProducedMg).toBe(0);
  });

  it('stops excreting ammonia as it suffocates, by the factor it stops breathing', () => {
    const at = (oxygen: number): ReturnType<typeof processMetabolism> =>
      processMetabolism([makeFish({ mass: 2.0 })], 10, oxygen, livestockDefaults);
    const gasping = at(1);
    const breathing = at(AMPLE_O2);

    expect(at(0).ammoniaProduced).toBe(0);
    expect(gasping.ammoniaProduced / breathing.ammoniaProduced).toBeCloseTo(
      gasping.oxygenConsumedMg / breathing.oxygenConsumedMg,
      12
    );
  });

  it('exhales the respiratory quotient in moles, not in milligrams', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);

    const o2Moles = result.oxygenConsumedMg / MW_O2;
    const co2Moles = result.co2ProducedMg / MW_CO2;

    expect(co2Moles).toBeCloseTo(o2Moles * livestockDefaults.respiratoryQuotient, 10);
  });

  it('increments age by 1 each tick', () => {
    const fish = [makeFish({ age: 100 })];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);

    expect(result.updatedFish[0].age).toBe(101);
  });

  it('feeds hungriest fish first', () => {
    const fish = [
      makeFish({ id: 'hungry', satiation: 10, mass: 1.0 }),
      makeFish({ id: 'full', satiation: 90, mass: 1.0 }),
    ];
    const availableFood = 0.005;
    const result = processMetabolism(fish, availableFood, AMPLE_O2, livestockDefaults);

    const hungryFish = result.updatedFish.find((f) => f.id === 'hungry')!;
    const fullFish = result.updatedFish.find((f) => f.id === 'full')!;

    expect(hungryFish.satiation).toBeGreaterThan(10);
    expect(fullFish.satiation).toBeLessThan(90);
    expect(fullFish.satiation).toBeGreaterThanOrEqual(90 - livestockDefaults.satiationDecayRate);
  });

  it('abundant food drives satiation to (100 − decayRate) steady state (overfeeding reachable via the eating loop)', () => {
    let fish: Fish[] = [makeFish({ satiation: 30, mass: 1.0 })];
    for (let i = 0; i < 50; i++) {
      const r = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);
      fish = r.updatedFish;
    }
    expect(fish[0].satiation).toBeCloseTo(100 - livestockDefaults.satiationDecayRate, 6);
  });

  it('decay alone reduces satiation at the configured rate per tick', () => {
    const fish = [makeFish({ satiation: 50, mass: 1.0 })];
    const r = processMetabolism(fish, 0, AMPLE_O2, livestockDefaults);
    expect(r.updatedFish[0].satiation).toBeCloseTo(
      50 - livestockDefaults.satiationDecayRate,
      6
    );
  });

  it('handles multiple fish metabolism cumulatively', () => {
    const fish = [
      makeFish({ id: 'f1', mass: 1.0 }),
      makeFish({ id: 'f2', mass: 2.0 }),
    ];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);
    const alone = processMetabolism(
      [makeFish({ mass: 1.0 })],
      10,
      AMPLE_O2,
      livestockDefaults
    );

    expect(result.oxygenConsumedMg).toBeCloseTo(alone.oxygenConsumedMg * 3.0, 6);
    expect(result.updatedFish).toHaveLength(2);
  });
});
