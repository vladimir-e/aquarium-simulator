import { describe, it, expect } from 'vitest';
import { appetite, digest, fullPaceLine, gutCapacity, gutRoom, ration, shareCapped, swallow, type Pace } from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { NO_STRESS, assimilationCeiling, stepDeb } from './deb.js';
import { debParams } from '../livestock/species.js';
import { fishRecord } from '../tests/fish.js';
import type { Fish } from '../state.js';

const REFERENCE: Pace = { tau: 1, omega: 1, stress: NO_STRESS };
const guppy = (size: number, gut = 0): Fish => fishRecord({ species: 'guppy', size, gut });

describe('appetite', () => {
  it('is the assimilation ceiling in food: {p_Am}·L² over κ_X', () => {
    const fish = guppy(50);
    const p = debParams('guppy');
    expect(appetite(fish, REFERENCE)).toBeCloseTo(assimilationCeiling(fish.deb, p, REFERENCE) / p.kappaX, 15);
  });

  it('rises with its surface, so a fry eats more for its weight than its parents', () => {
    const [fry, adult] = [guppy(20), guppy(80)];
    const surfaces = (adult.deb.structure / fry.deb.structure) ** (2 / 3);
    expect(appetite(adult, REFERENCE) / appetite(fry, REFERENCE)).toBeCloseTo(surfaces, 12);
    expect(appetite(fry, REFERENCE) / fry.deb.structure).toBeGreaterThan(appetite(adult, REFERENCE) / adult.deb.structure);
  });

  it('runs at τ·ω and falls with assimilation stress', () => {
    const fish = guppy(50);
    const base = appetite(fish, REFERENCE);
    expect(appetite(fish, { tau: 1.5, omega: 0.5 })).toBeCloseTo(0.75 * base, 15);
    expect(appetite(fish, { ...REFERENCE, stress: { ...NO_STRESS, assimilation: 0.4 } })).toBeCloseTo(0.4 * base, 15);
  });
});

describe('ration', () => {
  it('is the food whose assimilation pays the upkeep it owes, gram for gram', () => {
    const fish = guppy(50);
    const p = debParams('guppy');
    const { owed } = stepDeb(fish.deb, p, { fromGut: 0, ...REFERENCE }).fluxes;
    const fed = stepDeb(fish.deb, p, { fromGut: ration(fish, owed), ...REFERENCE }).fluxes;
    expect(fed.assimilated).toBeCloseTo(owed, 15);
    expect(fed.returned).toBe(0);
  });
});

describe('the gut', () => {
  it('holds a day of its appetite, and wants the room left in it', () => {
    const fish = guppy(50);
    expect(gutCapacity(fish, REFERENCE)).toBeCloseTo(HOURS_PER_DAY * appetite(fish, REFERENCE), 15);
    const half = { ...fish, gut: gutCapacity(fish, REFERENCE) / 2 };
    expect(gutRoom(half, REFERENCE)).toBeCloseTo(gutCapacity(fish, REFERENCE) / 2, 15);
    expect(gutRoom({ ...fish, gut: 2 * gutCapacity(fish, REFERENCE) }, REFERENCE)).toBe(0);
  });

  it('digests first order at τ: the same share of whatever it holds', () => {
    expect(digest(1, 1, config)).toBeCloseTo(hourlyDraw(config.digestionRate), 12);
    expect(digest(2, 1.5, config)).toBeCloseTo(2 * hourlyDraw(1.5 * config.digestionRate), 12);
    expect(digest(1, 0, config)).toBe(0);
    expect(digest(1, 1e6, config)).toBeLessThanOrEqual(1);
  });

  it('draws the full-pace line where a gut that full digests what the budget can take up in the hour', () => {
    for (const tau of [1, 1.6]) {
      const fish = guppy(50);
      const pace = { ...REFERENCE, tau };
      const line = fullPaceLine(tau, config) * gutCapacity(fish, pace);
      expect(digest(line, tau, config)).toBeCloseTo(appetite(fish, pace), 12);
    }
    expect(fullPaceLine(0.5, config)).toBe(1);
    expect(fullPaceLine(0, config)).toBe(1);
  });
});

describe('shareCapped', () => {
  it('gives every weight its share in full while the caps have room', () => {
    const { taken, overflow } = shareCapped([1, 2], [1, 1], 0.3);
    expect(taken[0]).toBeCloseTo(0.1, 12);
    expect(taken[1]).toBeCloseTo(0.2, 12);
    expect(overflow).toBe(0);
  });

  it('splits by weight, a zero weight taking nothing', () => {
    const { taken } = shareCapped([1, 3, 0], [1, 1, 1], 0.2);
    expect(taken[1] / taken[0]).toBeCloseTo(3, 12);
    expect(taken[2]).toBe(0);
  });

  it('returns one share per weight, each capped by its pair', () => {
    const { taken } = shareCapped([1, 1, 1], [0.1, 0, 5], 3);
    expect(taken).toHaveLength(3);
    expect(taken).toEqual([0.1, 0, 1]);
  });

  it('overflows everything when every cap is zero', () => {
    const { taken, overflow } = shareCapped([1, 2], [0, 0], 0.5);
    expect(taken).toEqual([0, 0]);
    expect(overflow).toBeCloseTo(0.5, 12);
  });

  it('overflows everything when nobody weighs in, and nothing of nothing', () => {
    expect(shareCapped([0, 0], [1, 1], 0.2)).toEqual({ taken: [0, 0], overflow: 0.2 });
    expect(shareCapped([1, 1], [1, 1], 0)).toEqual({ taken: [0, 0], overflow: 0 });
  });

  it('takes no NaN from an endless amount: a zero weight takes nothing, the rest their caps', () => {
    const { taken, overflow } = shareCapped([0, 1], [1, 0.5], Infinity);
    expect(taken).toEqual([0, 0.5]);
    expect(overflow).toBe(Infinity);
  });

  it('accounts for every gram', () => {
    const amount = 2;
    const { taken, overflow } = shareCapped([3, 1, 2, 0], [0.4, 1, 0.2, 1], amount);
    expect(taken.reduce((sum, g) => sum + g, 0) + overflow).toBeCloseTo(amount, 12);
  });
});

describe('swallow', () => {
  const school = (): Fish[] => [guppy(30), guppy(60), { ...guppy(50), gut: gutCapacity(guppy(50), REFERENCE) }];
  const paces = [REFERENCE, REFERENCE, REFERENCE];

  it('takes each share while the gut has room, leaving the eaters as they were', () => {
    const eaters = Object.freeze(school().map((e) => Object.freeze(e)));
    const shares = [1e-5, 3e-5, 0];
    expect(swallow(eaters, paces, shares)).toEqual({ taken: shares, overflow: 0 });
    expect(eaters.map((e) => e.gut)).toEqual([0, 0, gutCapacity(guppy(50), REFERENCE)]);
  });

  it('takes no more than a gut has room for, the rest overflowing, every gram accounted for', () => {
    const eaters = school();
    const { taken, overflow } = swallow(eaters, paces, [5, 5, 5]);
    eaters.forEach((e, i) => expect(e.gut + taken[i]).toBeLessThanOrEqual(gutCapacity(e, REFERENCE) + 1e-15));
    expect(overflow).toBeGreaterThan(0);
    expect(taken.reduce((sum, g) => sum + g, 0) + overflow).toBeCloseTo(15, 12);
  });
});
