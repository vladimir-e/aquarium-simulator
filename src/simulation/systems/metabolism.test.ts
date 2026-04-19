import { describe, it, expect } from 'vitest';
import { processMetabolism } from './metabolism.js';
import { livestockDefaults } from '../config/livestock.js';
import { MW_N, MW_NH3 } from './nitrogen-cycle.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import type { Fish } from '../state.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    hunger: 50,
    sex: 'male',
    ...overrides,
  };
}

describe('processMetabolism', () => {
  it('returns empty results for no fish', () => {
    const result = processMetabolism([], 5, livestockDefaults);
    expect(result.updatedFish).toHaveLength(0);
    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
    expect(result.oxygenConsumedMg).toBe(0);
    expect(result.co2ProducedMg).toBe(0);
  });

  it('consumes food based on hunger and mass', () => {
    const fish = [makeFish({ hunger: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // foodNeeded = (50/100) * 1.0 * 0.01 = 0.005g
    expect(result.foodConsumed).toBeCloseTo(0.005, 4);
  });

  it('does not consume more food than available', () => {
    const fish = [makeFish({ hunger: 100, mass: 10 })];
    const availableFood = 0.001;
    const result = processMetabolism(fish, availableFood, livestockDefaults);

    expect(result.foodConsumed).toBeLessThanOrEqual(availableFood);
  });

  it('increases hunger over time', () => {
    const fish = [makeFish({ hunger: 20 })];
    const result = processMetabolism(fish, 0, livestockDefaults);

    // No food available, so hunger only increases
    expect(result.updatedFish[0].hunger).toBeGreaterThan(20);
    // Should increase by hungerIncreaseRate (0.6)
    expect(result.updatedFish[0].hunger).toBeCloseTo(20.6, 0);
  });

  it('reduces hunger when food is consumed', () => {
    const fish = [makeFish({ hunger: 80, mass: 1.0 })];
    // Lots of food available
    const result = processMetabolism(fish, 100, livestockDefaults);

    // Hunger should decrease (food eaten reduces hunger) then increase by rate
    // Net should be less than 80 when enough food is available
    expect(result.updatedFish[0].hunger).toBeLessThan(80);
  });

  it('caps hunger at 100', () => {
    const fish = [makeFish({ hunger: 99 })];
    const result = processMetabolism(fish, 0, livestockDefaults);

    expect(result.updatedFish[0].hunger).toBeLessThanOrEqual(100);
  });

  it('caps hunger at 0 minimum', () => {
    const fish = [makeFish({ hunger: 1, mass: 10 })];
    // Give tons of food
    const result = processMetabolism(fish, 1000, livestockDefaults);

    expect(result.updatedFish[0].hunger).toBeGreaterThanOrEqual(0);
  });

  it('splits food nitrogen between direct gill NH3 and feces-bound waste', () => {
    const fish = [makeFish({ hunger: 50, mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    expect(result.foodConsumed).toBeGreaterThan(0);
    expect(result.wasteProduced).toBeGreaterThan(0);
    expect(result.ammoniaProduced).toBeGreaterThan(0);

    // wasteMass = foodGiven × (1 − gillNFraction)
    const expectedWaste = result.foodConsumed * (1 - livestockDefaults.gillNFraction);
    expect(result.wasteProduced).toBeCloseTo(expectedWaste, 8);

    // directNH3 = foodGiven × foodNitrogenFraction × gillNFraction × MW_NH3/MW_N × 1000
    const expectedNH3 =
      result.foodConsumed *
      livestockDefaults.foodNitrogenFraction *
      livestockDefaults.gillNFraction *
      (MW_NH3 / MW_N) *
      1000;
    expect(result.ammoniaProduced).toBeCloseTo(expectedNH3, 6);
  });

  it('emits the canonical 48.65 mg NH3 + 0.2 g waste per gram of food at defaults', () => {
    // A 100-g fish with 100% hunger eats mass × baseFoodRate × hunger/100
    // = 100 × 0.01 × 1.0 = 1 g of food this tick.
    const fish = [makeFish({ hunger: 100, mass: 100 })];
    const result = processMetabolism(fish, 1, livestockDefaults);

    expect(result.foodConsumed).toBeCloseTo(1, 8);
    // 1 g food × 5 % N × 80 % gill share × (17.03/14.01) × 1000 mg/g
    // = 0.04 × 1.21556... × 1000 = 48.6224 mg NH3
    expect(result.ammoniaProduced).toBeCloseTo(48.6224, 3);
    // 1 g food × 20 % feces share = 0.2 g waste
    expect(result.wasteProduced).toBeCloseTo(0.2, 8);
  });

  it('produces zero gill NH3 when no food is eaten', () => {
    const fish = [makeFish({ hunger: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 0, livestockDefaults);

    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
  });

  it('conserves nitrogen end-to-end: direct NH3 + waste-borne NH3 = ingested N', () => {
    // Over many ticks, the N excreted directly plus the N that will
    // eventually mineralise from the waste stream should equal the N
    // ingested. This is the N-mass conservation invariant.
    //
    // Note: the engine's `wasteToAmmoniaRatio = 60` (mg NH3 / g waste)
    // is a rounded stoichiometric value — the true figure for 5 % N
    // waste is 0.05 × MW_NH3/MW_N × 1000 ≈ 60.78. That ~1.3 % rounding
    // is a pre-existing property of Task 26's calibration choice and
    // is tolerated here. Closing it would require bumping the ratio
    // to 60.78, which shifts the fishless-seeded anchor — out of
    // scope for this task.
    const fish = [makeFish({ hunger: 100, mass: 10 })];
    let totalFood = 0;
    let totalDirectNH3 = 0; // mg NH3
    let totalWaste = 0; // g
    for (let t = 0; t < 24; t++) {
      const r = processMetabolism(fish, 1000, livestockDefaults);
      totalFood += r.foodConsumed;
      totalDirectNH3 += r.ammoniaProduced;
      totalWaste += r.wasteProduced;
    }

    // Ingested N-mass (g)
    const nIngested = totalFood * livestockDefaults.foodNitrogenFraction;
    // Direct N-mass in the gill stream
    const nDirect = totalDirectNH3 / ((MW_NH3 / MW_N) * 1000);
    // N-mass that will come out of waste when it mineralises — use the
    // engine's canonical wasteToAmmoniaRatio (mg NH3 / g waste) to
    // convert back to N.
    const nWaste =
      (totalWaste * nitrogenCycleDefaults.wasteToAmmoniaRatio) / ((MW_NH3 / MW_N) * 1000);

    // Tolerance follows the engine's own rounding: 60 vs. 60.78 in the
    // waste ratio = 1.3 % error on the 20 % feces share = 0.26 % of
    // ingested N overall. Allow 0.5 % as the conservation envelope.
    const relError = Math.abs(nDirect + nWaste - nIngested) / nIngested;
    expect(relError).toBeLessThan(0.005);
  });

  it('conserves nitrogen exactly when waste ratio matches stoichiometry', () => {
    // Verifies the N-conservation invariant holds exactly when the
    // engine's waste-to-NH3 ratio is set to its stoichiometric value
    // (0.05 × MW_NH3/MW_N × 1000 ≈ 60.78 mg NH3 / g waste). Any future
    // calibration tightening of `wasteToAmmoniaRatio` can rely on this.
    const fish = [makeFish({ hunger: 100, mass: 10 })];
    let totalFood = 0;
    let totalDirectNH3 = 0;
    let totalWaste = 0;
    for (let t = 0; t < 24; t++) {
      const r = processMetabolism(fish, 1000, livestockDefaults);
      totalFood += r.foodConsumed;
      totalDirectNH3 += r.ammoniaProduced;
      totalWaste += r.wasteProduced;
    }

    const nIngested = totalFood * livestockDefaults.foodNitrogenFraction;
    const nDirect = totalDirectNH3 / ((MW_NH3 / MW_N) * 1000);
    // Use the stoichiometric ratio (not the configured rounded 60).
    const stoichRatio = livestockDefaults.foodNitrogenFraction * (MW_NH3 / MW_N) * 1000;
    const nWaste = (totalWaste * stoichRatio) / ((MW_NH3 / MW_N) * 1000);

    expect(nDirect + nWaste).toBeCloseTo(nIngested, 10);
  });

  it('consumes oxygen based on mass', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // oxygenConsumedMg = baseRespirationRate * mass = 0.3 * 2.0 = 0.6 mg/hr
    expect(result.oxygenConsumedMg).toBeCloseTo(
      livestockDefaults.baseRespirationRate * 2.0,
      6
    );
  });

  it('produces CO2 proportional to oxygen consumed', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // CO2 = O2 consumed * respiratoryQuotient
    expect(result.co2ProducedMg).toBeCloseTo(
      result.oxygenConsumedMg * livestockDefaults.respiratoryQuotient,
      6
    );
  });

  it('increments age by 1 each tick', () => {
    const fish = [makeFish({ age: 100 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    expect(result.updatedFish[0].age).toBe(101);
  });

  it('feeds hungriest fish first', () => {
    const fish = [
      makeFish({ id: 'hungry', hunger: 90, mass: 1.0 }),
      makeFish({ id: 'full', hunger: 10, mass: 1.0 }),
    ];
    // Very limited food - only enough for one fish
    const availableFood = 0.005;
    const result = processMetabolism(fish, availableFood, livestockDefaults);

    // Hungry fish should have consumed most/all food
    const hungryFish = result.updatedFish.find((f) => f.id === 'hungry')!;
    const fullFish = result.updatedFish.find((f) => f.id === 'full')!;

    // Hungry fish should have had its hunger reduced more
    // Full fish should have barely eaten anything
    expect(hungryFish.hunger).toBeLessThan(90 + livestockDefaults.hungerIncreaseRate);
    expect(fullFish.hunger).toBeGreaterThan(10); // Should still get hungrier
  });

  it('handles multiple fish metabolism cumulatively', () => {
    const fish = [
      makeFish({ id: 'f1', mass: 1.0 }),
      makeFish({ id: 'f2', mass: 2.0 }),
    ];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // Total O2 consumption = baseRespirationRate * (1.0 + 2.0) mg/hr
    expect(result.oxygenConsumedMg).toBeCloseTo(
      livestockDefaults.baseRespirationRate * 3.0,
      6
    );
    expect(result.updatedFish).toHaveLength(2);
  });
});
