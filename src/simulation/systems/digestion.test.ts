import { describe, it, expect } from 'vitest';
import {
  appetite,
  dailyMaintenance,
  digest,
  gutCapacity,
  hungerLine,
  maintenance,
  nourishment,
  shareCapped,
  swallow,
} from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';

describe('digestion', () => {
  it('digests first order: the same share of whatever the gut holds', () => {
    expect(digest(1, 1, config)).toBeCloseTo(hourlyDraw(config.digestionRate), 12);
    expect(digest(2, 1, config)).toBeCloseTo(2 * digest(1, 1, config), 12);
    expect(digest(0, 1, config)).toBe(0);
  });

  it('digests nothing when its metabolism stops', () => {
    expect(digest(1, 0, config)).toBe(0);
  });

  it('never digests more than the gut holds', () => {
    expect(digest(1, 1e6, config)).toBeLessThanOrEqual(1);
  });
});

describe('maintenance', () => {
  it('needs a day\'s ration by mass in reference water', () => {
    expect(dailyMaintenance([{ mass: 1 }, { mass: 3 }], 1, config)).toBeCloseTo(4 * config.maintenanceRation, 12);
  });

  it('needs less as its metabolism slows, in step with the factor', () => {
    expect(dailyMaintenance([{ mass: 2 }], 0.5, config)).toBeCloseTo(0.5 * dailyMaintenance([{ mass: 2 }], 1, config), 12);
    expect(maintenance({ mass: 1 }, 0.5, config)).toBeCloseTo(0.5 * maintenance({ mass: 1 }, 1, config), 12);
    expect(maintenance({ mass: 1 }, 0, config)).toBe(0);
  });
});

describe('appetite', () => {
  it('wants the room left in its gut, and nothing when full', () => {
    const fish = { mass: 2, gut: 0 };
    expect(appetite(fish, config)).toBeCloseTo(gutCapacity(fish, config), 12);
    expect(appetite({ mass: 2, gut: gutCapacity(fish, config) }, config)).toBe(0);
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
  const school = (): { mass: number; gut: number }[] => [
    { mass: 10, gut: 0 },
    { mass: 30, gut: 0 },
    { mass: 20, gut: 20 * config.gutCapacity },
  ];

  it('takes each share while the gut has room, leaving the eaters as they were', () => {
    const eaters = Object.freeze(school().map((e) => Object.freeze(e)));
    expect(swallow(eaters, [0.001, 0.003, 0], config)).toEqual({ taken: [0.001, 0.003, 0], overflow: 0 });
    expect(eaters.map((e) => e.gut)).toEqual([0, 0, 20 * config.gutCapacity]);
  });

  it('takes no more than a gut has room for, the rest overflowing, every gram accounted for', () => {
    const eaters = school();
    const shares = [5, 5, 5];
    const { taken, overflow } = swallow(eaters, shares, config);
    eaters.forEach((e, i) => expect(e.gut + taken[i]).toBeLessThanOrEqual(gutCapacity(e, config) + 1e-15));
    expect(overflow).toBeGreaterThan(0);
    expect(taken.reduce((sum, g) => sum + g, 0) + overflow).toBeCloseTo(15, 12);
  });
});

describe('nourishment', () => {
  it('earns half its benefits on its maintenance ration, more on more, none on nothing', () => {
    const need = maintenance({ mass: 1 }, 1, config);
    expect(nourishment(need, need)).toBeCloseTo(0.5, 12);
    expect(nourishment(3 * need, need)).toBeGreaterThan(nourishment(2 * need, need));
    expect(nourishment(0, need)).toBe(0);
  });

  it('draws the hunger line where a gut that full digests its maintenance, at any metabolic factor', () => {
    const fish = { mass: 2 };
    for (const factor of [1, 0.4]) {
      const gut = hungerLine(factor, config) * gutCapacity(fish, config);
      expect(digest(gut, factor, config)).toBeCloseTo(maintenance(fish, factor, config), 12);
    }
    expect(hungerLine(0, config)).toBe(0);
  });
});
