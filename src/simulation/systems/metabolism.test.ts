import { describe, it, expect } from 'vitest';
import { excretion, processMetabolism, type Excretion, type MetabolismResult, type MetabolismWater } from './metabolism.js';
import { gutCapacity, metabolicMass } from './digestion.js';
import { livestockDefaults } from '../config/livestock.js';
import { WASTE_NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { MW_CO2, MW_N, MW_NH3, MW_O2 } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';
import type { Fish } from '../state.js';

const AMPLE_O2 = 8;
const NH3_PER_G_N = (MW_NH3 / MW_N) * 1000;

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    gut: 0,
    sex: 'male',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function water(overrides: Partial<MetabolismWater> = {}): MetabolismWater {
  return { food: 10, oxygen: AMPLE_O2, temperature: 25, ...overrides };
}

const full = (mass: number): number => gutCapacity({ species: 'neon_tetra', mass }, livestockDefaults);

const excreted = (r: MetabolismResult, retained = 0): Excretion =>
  excretion(r.digested.reduce((a, b) => a + b, 0), retained, livestockDefaults);

describe('processMetabolism', () => {
  it('returns empty results for no fish', () => {
    const result = processMetabolism([], water(), livestockDefaults);
    expect(result.updatedFish).toHaveLength(0);
    expect(result.digested).toHaveLength(0);
    expect(result.foodConsumed).toBe(0);
    expect(result.oxygenConsumedMg).toBe(0);
    expect(result.co2ProducedMg).toBe(0);
  });

  it('fills every gut to capacity while the food lasts', () => {
    const fish = [makeFish({ mass: 1 }), makeFish({ id: 'b', mass: 2, gut: full(2) / 2 })];
    const result = processMetabolism(fish, water({ food: 100 }), livestockDefaults);

    result.updatedFish.forEach((f) => expect(f.gut).toBeCloseTo(full(f.mass), 12));
  });

  it('serves short food in proportion to appetite, so every fish fills the same share of its room', () => {
    const fish = [
      makeFish({ id: 'empty', mass: 1 }),
      makeFish({ id: 'half', mass: 1, gut: full(1) / 2 }),
      makeFish({ id: 'big', mass: 3 }),
    ];
    const food = 0.01;
    const result = processMetabolism(fish, water({ food, oxygen: 0 }), livestockDefaults);

    expect(result.foodConsumed).toBeCloseTo(food, 12);
    const shares = result.updatedFish.map((f, i) => (f.gut - fish[i].gut) / (full(f.mass) - fish[i].gut));
    shares.forEach((share) => expect(share).toBeCloseTo(shares[0], 12));
  });

  it('eats nothing with nothing in the water', () => {
    const result = processMetabolism([makeFish({ gut: 0.001 })], water({ food: 0 }), livestockDefaults);
    expect(result.foodConsumed).toBe(0);
    expect(result.updatedFish[0].gut).toBeLessThan(0.001);
  });

  it("releases a meal's nitrogen as it digests, not as it is eaten", () => {
    const meal = processMetabolism([makeFish()], water(), livestockDefaults);
    expect(meal.foodConsumed).toBeGreaterThan(0);
    expect(excreted(meal).ammonia).toBe(0);
    expect(excreted(meal).waste).toBe(0);

    const after = processMetabolism(meal.updatedFish, water({ food: 0 }), livestockDefaults);
    expect(after.digested[0]).toBeGreaterThan(0);
    expect(excreted(after).ammonia).toBeGreaterThan(0);
    expect(excreted(after).waste).toBeGreaterThan(0);
  });

  it('conserves nitrogen: what the gut loses leaves through the gills and the feces', () => {
    for (const oxygen of [AMPLE_O2, 1, 0.1]) {
      let fish = [makeFish({ mass: 2, gut: full(2) })];
      const start = fish[0].gut;
      let ammonia = 0;
      let waste = 0;
      for (let hour = 0; hour < 72; hour++) {
        const r = processMetabolism(fish, water({ food: 0, oxygen }), livestockDefaults);
        ammonia += excreted(r).ammonia;
        waste += excreted(r).waste;
        fish = r.updatedFish;
      }
      const digestedN = (start - fish[0].gut) * livestockDefaults.foodNitrogenFraction;
      const releasedN = ammonia / NH3_PER_G_N + waste * livestockDefaults.foodNitrogenFraction;
      expect(releasedN).toBeCloseTo(digestedN, 12);
    }
  });

  it('splits digested nitrogen between gill NH3 and feces at assimilatedFraction', () => {
    const r = processMetabolism([makeFish({ mass: 2, gut: full(2) })], water({ food: 0 }), livestockDefaults);
    const digested = r.digested[0];

    expect(excreted(r).waste).toBeCloseTo(digested * (1 - livestockDefaults.assimilatedFraction), 12);
    expect(excreted(r).ammonia).toBeCloseTo(
      digested * livestockDefaults.foodNitrogenFraction * livestockDefaults.assimilatedFraction * NH3_PER_G_N,
      9
    );
  });

  it('returns every milligram of digested mineral to the water, gills and feces together', () => {
    const release = nutrientsDefaults.foodMineralContent;
    const fish = [makeFish({ mass: 2, gut: full(2) }), makeFish({ id: 'b', gut: full(0.5) / 3 })];
    const r = processMetabolism(fish, water(), livestockDefaults);
    const digested = r.digested.reduce((a, b) => a + b, 0);
    const out = excretion(digested, 0, livestockDefaults, release);
    for (const n of WASTE_NUTRIENTS) {
      expect(out.minerals[n] + out.waste * release[n]).toBeCloseTo(digested * release[n], 12);
    }
  });

  it('holds back from the gills exactly what growth retains, nitrogen and minerals alike, and never from the feces', () => {
    const release = nutrientsDefaults.foodMineralContent;
    const digested = 0.01;
    const retained = 0.003;
    const adult = excretion(digested, 0, livestockDefaults, release);
    const growing = excretion(digested, retained, livestockDefaults, release);

    expect(growing.waste).toBe(adult.waste);
    expect((adult.ammonia - growing.ammonia) / NH3_PER_G_N).toBeCloseTo(retained * livestockDefaults.foodNitrogenFraction, 15);
    for (const n of WASTE_NUTRIENTS) {
      expect(adult.minerals[n] - growing.minerals[n]).toBeCloseTo(retained * release[n], 15);
    }
  });

  it('never takes back through the gills more than the fish assimilated', () => {
    const digested = 0.01;
    const out = excretion(digested, digested, livestockDefaults);
    expect(out.ammonia).toBe(0);
    for (const n of WASTE_NUTRIENTS) expect(out.minerals[n]).toBe(0);
    expect(out.waste).toBeCloseTo(digested * (1 - livestockDefaults.assimilatedFraction), 15);
  });

  it('breathes on the metabolic factor, harder warm and slower cold', () => {
    const at = (temperature: number): MetabolismResult =>
      processMetabolism([makeFish({ mass: 2 })], water({ temperature }), livestockDefaults);
    const { metabolicReferenceTemp: ref } = livestockDefaults;
    for (const temperature of [ref - 10, ref, ref + 5]) {
      const r = at(temperature);
      expect(r.oxygenConsumedMg).toBeCloseTo(
        livestockDefaults.baseRespirationRate * metabolicMass(makeFish({ mass: 2 }), livestockDefaults) * r.metabolicFactor,
        12
      );
    }
    expect(at(ref + 5).oxygenConsumedMg).toBeGreaterThan(at(ref).oxygenConsumedMg);
  });

  it('consumes oxygen on metabolic mass, at half its base rate at the half-saturation constant', () => {
    const fish = makeFish({ mass: 2 });
    const at = (oxygen: number): number =>
      processMetabolism([fish], water({ oxygen }), livestockDefaults).oxygenConsumedMg;
    const base = livestockDefaults.baseRespirationRate * metabolicMass(fish, livestockDefaults);

    expect(at(AMPLE_O2)).toBeCloseTo(
      base * monodFactor(AMPLE_O2, livestockDefaults.respirationOxygenHalfSaturation),
      9
    );
    expect(at(livestockDefaults.respirationOxygenHalfSaturation)).toBeCloseTo(base * 0.5, 9);
    expect(at(0)).toBe(0);
  });

  it('digests and breathes on one oxygen factor: suffocating slows both', () => {
    const at = (oxygen: number): MetabolismResult =>
      processMetabolism([makeFish({ mass: 2, gut: full(2) })], water({ food: 0, oxygen }), livestockDefaults);
    const gasping = at(1);
    const breathing = at(AMPLE_O2);

    expect(excreted(at(0)).ammonia).toBe(0);
    expect(gasping.digested[0]).toBeLessThan(breathing.digested[0]);
    expect(gasping.oxygenConsumedMg).toBeLessThan(breathing.oxygenConsumedMg);
  });

  it('runs on one metabolic factor: the metabolic Q10 per ten degrees, times the oxygen factor', () => {
    const { metabolicReferenceTemp: ref, metabolicQ10, respirationOxygenHalfSaturation: k } = livestockDefaults;
    const factor = (temperature: number, oxygen: number): number =>
      processMetabolism([], water({ temperature, oxygen }), livestockDefaults).metabolicFactor;

    expect(factor(ref, AMPLE_O2) / factor(ref - 10, AMPLE_O2)).toBeCloseTo(metabolicQ10, 12);
    expect(factor(ref, k)).toBeCloseTo(0.5, 12);
    expect(factor(ref, 0)).toBe(0);
  });

  it('exhales the respiratory quotient in moles, not in milligrams', () => {
    const result = processMetabolism([makeFish({ mass: 2 })], water(), livestockDefaults);

    expect(result.co2ProducedMg / MW_CO2).toBeCloseTo(
      (result.oxygenConsumedMg / MW_O2) * livestockDefaults.respiratoryQuotient,
      10
    );
  });

  it('breathes per gram on mass^−¼ against a grown fish of its species', () => {
    const perGram = (mass: number): number =>
      processMetabolism([makeFish({ mass })], water(), livestockDefaults).oxygenConsumedMg / mass;
    const adult = 0.5;
    expect(perGram(adult / 16) / perGram(adult)).toBeCloseTo(2, 9);
    expect(perGram(adult)).toBeCloseTo(
      livestockDefaults.baseRespirationRate * monodFactor(AMPLE_O2, livestockDefaults.respirationOxygenHalfSaturation),
      9
    );
  });

  it('increments age by 1 each tick', () => {
    const result = processMetabolism([makeFish({ age: 100 })], water(), livestockDefaults);
    expect(result.updatedFish[0].age).toBe(101);
  });

  it('never yields a non-finite number at the edges', () => {
    for (const w of [water({ food: 0, oxygen: 0 }), water({ temperature: 0 }), water({ food: Infinity })]) {
      const r = processMetabolism([makeFish(), makeFish({ id: 'b', mass: 0 })], w, livestockDefaults);
      const numbers = [
        ...r.digested,
        ...r.updatedFish.map((f) => f.gut),
        excreted(r).waste,
        excreted(r).ammonia,
        r.oxygenConsumedMg,
        r.co2ProducedMg,
      ];
      numbers.forEach((n) => expect(Number.isFinite(n)).toBe(true));
    }
  });
});
