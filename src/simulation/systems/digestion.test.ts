import { describe, it, expect } from 'vitest';
import {
  appetite,
  digest,
  digestionRate,
  gutCapacity,
  hungerLine,
  maintenance,
  nourishment,
  serve,
} from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { hourlyDraw } from './vitality.js';

const AMPLE_O2 = 8;

describe('digestion', () => {
  it('digests first order: the same share of whatever the gut holds', () => {
    const rate = digestionRate(25, AMPLE_O2, config);
    expect(digest(1, rate)).toBeCloseTo(hourlyDraw(rate), 12);
    expect(digest(2, rate)).toBeCloseTo(2 * digest(1, rate), 12);
    expect(digest(0, rate)).toBe(0);
  });

  it('digests slower cold, by its Q10 per ten degrees', () => {
    const warm = digestionRate(config.digestionReferenceTemp, AMPLE_O2, config);
    const cold = digestionRate(config.digestionReferenceTemp - 10, AMPLE_O2, config);
    expect(warm / cold).toBeCloseTo(config.digestionQ10, 12);
  });

  it("digests on the metabolism's oxygen factor: half rate at its half-saturation, none without oxygen", () => {
    const ample = config.digestionRate;
    expect(digestionRate(config.digestionReferenceTemp, config.respirationOxygenHalfSaturation, config)).toBeCloseTo(
      ample * 0.5,
      12
    );
    expect(digestionRate(25, 0, config)).toBe(0);
  });

  it('never digests more than the gut holds', () => {
    expect(digest(1, 1e6)).toBeLessThanOrEqual(1);
  });
});

describe('appetite and serving', () => {
  it('wants the room left in its gut, and nothing when full', () => {
    const fish = { mass: 2, gut: 0 };
    expect(appetite(fish, config)).toBeCloseTo(gutCapacity(fish, config), 12);
    expect(appetite({ mass: 2, gut: gutCapacity(fish, config) }, config)).toBe(0);
  });

  it('serves every appetite in full while the food lasts', () => {
    expect(serve([0.1, 0.2], 1)).toEqual([0.1, 0.2]);
  });

  it('splits short food by appetite, every eater taking the same share of its own', () => {
    const eaten = serve([0.1, 0.3, 0], 0.2);
    expect(eaten[0] + eaten[1] + eaten[2]).toBeCloseTo(0.2, 12);
    expect(eaten[1] / eaten[0]).toBeCloseTo(3, 12);
    expect(eaten[2]).toBe(0);
  });

  it('serves nothing when nobody is hungry or there is no food', () => {
    expect(serve([0, 0], 1)).toEqual([0, 0]);
    expect(serve([0.1], 0)).toEqual([0]);
  });
});

describe('nourishment', () => {
  it('earns half its benefits on its maintenance ration, more on more, none on nothing', () => {
    const need = maintenance({ mass: 1 }, config);
    expect(nourishment(need, need)).toBeCloseTo(0.5, 12);
    expect(nourishment(3 * need, need)).toBeGreaterThan(nourishment(2 * need, need));
    expect(nourishment(0, need)).toBe(0);
  });

  it('draws the hunger line where a gut that full digests the maintenance ration at the reference temperature', () => {
    const fish = { mass: 1 };
    const gut = hungerLine(config) * gutCapacity(fish, config);
    expect(gut * hourlyDraw(config.digestionRate)).toBeCloseTo(maintenance(fish, config), 12);
  });
});
