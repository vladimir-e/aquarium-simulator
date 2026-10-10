import { describe, it, expect } from 'vitest';
import { burn, fishPace, liveHour, oxygenPace, processMetabolism } from './metabolism.js';
import { gutCapacity, gutRoom, type Pace } from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { debParams } from '../livestock/species.js';
import { WASTE_NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { MW_CO2, MW_N, MW_NH3, MW_O2 } from '../core/chemistry.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { NO_STRESS, totalBurned } from './deb.js';
import { fishOrganics } from './fish-body.js';
import { fishRecord } from '../tests/fish.js';

const SATURATED = 8;
const REFERENCE: Pace = { tau: 1, omega: 1, stress: NO_STRESS };
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

describe('oxygenPace', () => {
  it('reads 1 in saturated water and above it, and nothing in none', () => {
    expect(oxygenPace(SATURATED, SATURATED, 1)).toBe(1);
    expect(oxygenPace(12, SATURATED, 1)).toBe(1);
    expect(oxygenPace(0, SATURATED, 1)).toBe(0);
  });

  it('is a Monod on dissolved oxygen against saturated water', () => {
    expect(oxygenPace(1, SATURATED, 1)).toBeCloseTo(0.5 / (SATURATED / (1 + SATURATED)), 12);
    expect(oxygenPace(2, SATURATED, 1)).toBeLessThan(oxygenPace(4, SATURATED, 1));
  });
});

describe('fishPace', () => {
  it('runs on its species’ Arrhenius temperature, and on oxygen alone for ω', () => {
    const pace = fishPace('guppy', { temperature: 26, oxygen: 3 }, SATURATED, config);
    expect(pace.tau).toBe(arrheniusFactor(26, debParams('guppy').TA));
    expect(pace.omega).toBe(oxygenPace(3, SATURATED, config.oxygenHalfSaturation));
    expect(pace.stress).toBe(NO_STRESS);
  });
});

describe('burn', () => {
  it('excretes the food recipe’s nitrogen as NH3 and its minerals, gram for gram', () => {
    const burnt = burn(2, config);
    expect(burnt.ammonia).toBeCloseTo(2 * config.foodNitrogenFraction * (MW_NH3 / MW_N) * 1000, 9);
    for (const n of WASTE_NUTRIENTS) expect(burnt.minerals[n]).toBeCloseTo(2 * nutrientsDefaults.foodMineralContent[n], 12);
  });

  it('breathes oxygenPerGramBurned and exhales the respiratory quotient in moles', () => {
    const burnt = burn(0.5, config);
    expect(burnt.oxygen).toBeCloseTo(0.5 * config.oxygenPerGramBurned, 9);
    expect(burnt.co2 / MW_CO2 / (burnt.oxygen / MW_O2)).toBeCloseTo(config.respiratoryQuotient, 12);
  });
});

describe('liveHour', () => {
  const fed = fishRecord({ species: 'guppy', gut: 0.003, age: 100 });

  it('closes its ledger: gut and body before are gut and body after, feces and burn', () => {
    for (const fish of [fed, { ...fed, gut: 0 }, { ...fed, health: 40 }]) {
      const hour = liveHour(fish, REFERENCE, 1e-5, config);
      const before = fish.gut + fishOrganics(fish);
      const after = hour.fish.gut + fishOrganics(hour.fish) + hour.fluxes.feces + totalBurned(hour.fluxes);
      expect(after).toBeCloseTo(before, 15);
    }
  });

  it('digests at τ and hands the gut back what the budget could not take up', () => {
    const hour = liveHour(fed, REFERENCE, 0, config);
    expect(hour.fish.gut).toBeCloseTo(fed.gut - hour.digested + hour.fluxes.returned, 15);
    expect(liveHour(fed, { ...REFERENCE, tau: 2 }, 0, config).digested).toBeGreaterThan(hour.digested);
  });

  it('ages an hour and keeps exp(−h) of its survival', () => {
    const old = { ...fed, deb: { ...fed.deb, hazard: 1e-3 }, survival: 0.8 };
    const hour = liveHour(old, REFERENCE, 0, config);
    expect(hour.fish.age).toBe(101);
    expect(hour.fish.survival).toBeCloseTo(0.8 * Math.exp(-1e-3), 15);
  });
});

describe('processMetabolism', () => {
  const school = [
    fishRecord({ id: 'a', species: 'guppy', size: 30 }),
    fishRecord({ id: 'b', species: 'guppy', size: 70 }),
  ];
  const paces = [REFERENCE, REFERENCE];

  it('returns nothing for no fish', () => {
    expect(processMetabolism([], [], [], { food: 1 }, config)).toEqual({
      hours: [],
      updatedFish: [],
      foodConsumed: 0,
      feces: 0,
      burned: 0,
    });
  });

  it('fills every gut while the food lasts', () => {
    const result = processMetabolism(school, paces, [0, 0], { food: 10 }, config);
    result.updatedFish.forEach((f) => expect(f.gut).toBeCloseTo(gutCapacity(f, REFERENCE), 15));
  });

  it('serves short food in proportion to the room in each gut, so every fish fills the same share of it', () => {
    const food = 1e-4;
    const result = processMetabolism(school, paces, [0, 0], { food }, config);
    const rooms = result.hours.map((hour) => gutRoom(hour.fish, REFERENCE));
    expect(result.foodConsumed).toBeCloseTo(food, 15);
    expect(result.updatedFish[1].gut / rooms[1]).toBeCloseTo(result.updatedFish[0].gut / rooms[0], 9);
  });

  it('eats nothing with nothing in the water', () => {
    expect(processMetabolism(school, paces, [0, 0], { food: 0 }, config).foodConsumed).toBe(0);
  });

  it('passes the hours’ feces and burn', () => {
    const fed = school.map((f) => ({ ...f, gut: 0.01 }));
    const result = processMetabolism(fed, paces, [0, 0], { food: 0 }, config);
    expect(result.feces).toBe(sum(result.hours.map((hour) => hour.fluxes.feces)));
    expect(result.burned).toBe(sum(result.hours.map((hour) => totalBurned(hour.fluxes))));
    expect(result.feces).toBeGreaterThan(0);
  });

  it('passes nothing the hour a meal is eaten: its waste comes out as it digests', () => {
    const result = processMetabolism(school, paces, [0, 0], { food: 10 }, config);
    expect(result.feces).toBe(0);
  });
});
