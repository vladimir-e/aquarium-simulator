import { describe, it, expect } from 'vitest';
import { processMetabolism } from './metabolism.js';
import { livestockDefaults } from '../config/livestock.js';
import { MW_CO2, MW_N, MW_NH3, MW_O2 } from '../core/chemistry.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { monodFactor } from '../core/kinetics.js';
import type { Fish } from '../state.js';

/**
 * Oxygen enough that nothing below is short of it — where a fish still leaves a
 * ninth on the table. Not air saturation, which is 8.38 mg/L at 25 °C and is
 * where `config/index.test.ts` reads what the livestock rates reproduce.
 */
const AMPLE_O2 = 8;

/**
 * What that water leaves of a fish's metabolism. Deamination and the
 * respiratory draw are the one metabolism, so both are quoted against it.
 */
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

  it('consumes food based on satiation and mass', () => {
    // satiation 50 → emptiness 0.5; foodNeeded = 0.5 × 1.0 × 0.01 = 0.005g
    const fish = [makeFish({ satiation: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 10, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBeCloseTo(0.005, 4);
  });

  it('does not consume more food than available', () => {
    const fish = [makeFish({ satiation: 0, mass: 10 })];
    const availableFood = 0.001;
    const result = processMetabolism(fish, availableFood, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBeLessThanOrEqual(availableFood);
  });

  it('decreases satiation over time when no food is available', () => {
    const fish = [makeFish({ satiation: 80 })];
    const result = processMetabolism(fish, 0, AMPLE_O2, livestockDefaults);

    // No food, so satiation only decays.
    expect(result.updatedFish[0].satiation).toBeLessThan(80);
    // Should decay by satiationDecayRate (0.6).
    expect(result.updatedFish[0].satiation).toBeCloseTo(79.4, 0);
  });

  it('raises satiation when food is consumed', () => {
    const fish = [makeFish({ satiation: 20, mass: 1.0 })];
    // Lots of food available
    const result = processMetabolism(fish, 100, AMPLE_O2, livestockDefaults);

    // Satiation should rise toward 100 (then decay knocks it back a hair).
    expect(result.updatedFish[0].satiation).toBeGreaterThan(20);
  });

  it('caps satiation at 100', () => {
    // Plenty of food, low satiation, mass 10 → eats ~1 g of food worth of
    // capacity, lands exactly at 100 then decays by 0.6 → 99.4. Verifies
    // the hard 100 cap inside the eating function.
    const fish = [makeFish({ satiation: 0, mass: 1 })];
    const result = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);

    expect(result.updatedFish[0].satiation).toBeLessThanOrEqual(100);
  });

  it('caps satiation at 0 minimum', () => {
    // Already-empty fish with no food still gets clamped at 0 after decay.
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

    // wasteMass = foodGiven × (1 − gillNFraction)
    const expectedWaste = result.foodConsumed * (1 - livestockDefaults.gillNFraction);
    expect(result.wasteProduced).toBeCloseTo(expectedWaste, 8);

    // Gill NH3 has two components: post-prandial (food-driven) + basal.
    //   postPrandial = foodGiven × foodNitrogenFraction × gillNFraction × MW_NH3/MW_N × 1000
    //   basal        = basalAmmoniaRate × mass
    const postPrandial =
      result.foodConsumed *
      livestockDefaults.foodNitrogenFraction *
      livestockDefaults.gillNFraction *
      (MW_NH3 / MW_N) *
      1000;
    const basal = livestockDefaults.basalAmmoniaRate * 2.0;
    expect(result.ammoniaProduced).toBeCloseTo((postPrandial + basal) * AMPLE_FACTOR, 6);
  });

  it('emits the canonical 48.62 mg NH3 + 0.2 g waste per gram of food (plus basal), less its air', () => {
    // A 100-g fish at satiation 0 (fully empty) eats mass × baseFoodRate
    // × emptiness = 100 × 0.01 × 1.0 = 1 g of food this tick.
    const fish = [makeFish({ satiation: 0, mass: 100 })];
    const result = processMetabolism(fish, 1, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBeCloseTo(1, 8);
    // Post-prandial: 1 g food × 5 % N × 80 % gill share × MW ratio × 1000
    //   = 0.04 × 1.21556 × 1000 = 48.622 mg NH3
    // Basal: basalAmmoniaRate × mass = 0.03 × 100 = 3.0 mg NH3
    // Total: 51.622 mg NH3 of deamination, of which this water leaves 8/9.
    const postPrandial = 48.6224;
    const basal = livestockDefaults.basalAmmoniaRate * 100;
    expect(result.ammoniaProduced).toBeCloseTo((postPrandial + basal) * AMPLE_FACTOR, 3);
    // 1 g food × 20 % feces share = 0.2 g waste
    expect(result.wasteProduced).toBeCloseTo(0.2, 8);
  });

  it('still produces basal gill NH3 when no food is eaten', () => {
    // A fasted fish keeps excreting NH3 from body protein turnover —
    // only the post-prandial pulse and feces-waste vanish.
    const fish = [makeFish({ satiation: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 0, AMPLE_O2, livestockDefaults);

    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    // Basal NH3 = basalAmmoniaRate × mass × the oxygen it is running on
    expect(result.ammoniaProduced).toBeCloseTo(
      livestockDefaults.basalAmmoniaRate * 1.0 * AMPLE_FACTOR,
      6
    );
  });

  it('conserves food-derived nitrogen: gill NH3 + feces + what the fish kept = ingested N', () => {
    // Over many ticks, the food-derived N (post-prandial gill stream
    // + waste stream) should equal the N ingested. Basal NH3 is a
    // separate source modelling body protein turnover; it appears
    // regardless of feeding and is additive to the food pathway.
    //
    // Deamination runs on the oxygen the fish has, so the gill stream is
    // short of its share by exactly what the fish did not deaminate — N that
    // stays in the body. Count it and the food pathway closes again.
    //
    // Note: the engine's `wasteToAmmoniaRatio = 60` (mg NH3 / g waste)
    // is a rounded stoichiometric value — the true figure for 5 % N
    // waste is 0.05 × MW_NH3/MW_N × 1000 ≈ 60.78. That ~1.3 % rounding
    // is a pre-existing property of Task 26's calibration choice.
    const mass = 10;
    const fish = [makeFish({ satiation: 0, mass })];
    let totalFood = 0;
    let totalDirectNH3 = 0; // mg NH3
    let totalWaste = 0; // g
    const ticks = 24;
    for (let t = 0; t < ticks; t++) {
      const r = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);
      totalFood += r.foodConsumed;
      totalDirectNH3 += r.ammoniaProduced;
      totalWaste += r.wasteProduced;
    }

    // Subtract basal contribution so we can measure food-pathway conservation.
    const basalNH3 = livestockDefaults.basalAmmoniaRate * mass * ticks * AMPLE_FACTOR;
    const foodDerivedNH3 = totalDirectNH3 - basalNH3;

    // Ingested N-mass (g)
    const nIngested = totalFood * livestockDefaults.foodNitrogenFraction;
    // Direct N-mass in the gill stream from food
    const nDirect = foodDerivedNH3 / ((MW_NH3 / MW_N) * 1000);
    // N-mass that will come out of waste when it mineralises — use the
    // engine's canonical wasteToAmmoniaRatio (mg NH3 / g waste) to
    // convert back to N.
    const nWaste =
      (totalWaste * nitrogenCycleDefaults.wasteToAmmoniaRatio) / ((MW_NH3 / MW_N) * 1000);
    // The share of the gill stream this water left undeaminated.
    const nKept =
      nIngested * livestockDefaults.gillNFraction * (1 - AMPLE_FACTOR);

    // Tolerance follows the engine's own rounding: 60 vs. 60.78 in the
    // waste ratio = 1.3 % error on the 20 % feces share = 0.26 % of
    // ingested N overall. Allow 0.5 % as the conservation envelope.
    const relError = Math.abs(nDirect + nWaste + nKept - nIngested) / nIngested;
    expect(relError).toBeLessThan(0.005);
  });

  it('conserves food-derived nitrogen exactly when waste ratio matches stoichiometry', () => {
    // Verifies the N-conservation invariant holds exactly for the
    // food pathway when the engine's waste-to-NH3 ratio is set to its
    // stoichiometric value (0.05 × MW_NH3/MW_N × 1000 ≈ 60.78 mg NH3
    // / g waste). Basal NH3 is subtracted out as it is a separate
    // body-turnover source, and the N the fish kept is added back.
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
    // Use the stoichiometric ratio (not the configured rounded 60).
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
    // Very limited food - only enough for one fish
    const availableFood = 0.005;
    const result = processMetabolism(fish, availableFood, AMPLE_O2, livestockDefaults);

    const hungryFish = result.updatedFish.find((f) => f.id === 'hungry')!;
    const fullFish = result.updatedFish.find((f) => f.id === 'full')!;

    // Hungry fish (low satiation) gets fed first → its satiation rises;
    // the already-near-full fish barely eats and just drifts down by decay.
    expect(hungryFish.satiation).toBeGreaterThan(10);
    expect(fullFish.satiation).toBeLessThan(90); // drifts down via decay
    expect(fullFish.satiation).toBeGreaterThanOrEqual(90 - livestockDefaults.satiationDecayRate);
  });

  it('abundant food drives satiation to (100 − decayRate) steady state (overfeeding reachable via the eating loop)', () => {
    // Each tick: eat fills the gap up to 100, then decay subtracts
    // satiationDecayRate. With unlimited food the per-tick equilibrium
    // is 100 − decayRate — i.e. the fish keeps eating to the cap every
    // tick, and the next tick's decay knocks it back the same amount.
    // Overfeeding is reachable: the cap is hit every tick before decay,
    // and that's exactly the condition the overfed stressor charges
    // against.
    let fish: Fish[] = [makeFish({ satiation: 30, mass: 1.0 })];
    for (let i = 0; i < 50; i++) {
      const r = processMetabolism(fish, 1000, AMPLE_O2, livestockDefaults);
      fish = r.updatedFish;
    }
    expect(fish[0].satiation).toBeCloseTo(100 - livestockDefaults.satiationDecayRate, 6);
  });

  it('decay alone reduces satiation at the configured rate per tick', () => {
    // No food at all → satiation drops by exactly satiationDecayRate
    // each tick (no eating to offset).
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
