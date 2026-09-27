import { describe, it, expect } from 'vitest';
import {
  appetite,
  dailyMaintenance,
  digest,
  gutCapacity,
  hungerLine,
  maintenance,
  nourishment,
  serve,
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

describe('swallow', () => {
  const eaters = [
    { mass: 10, gut: 0 },
    { mass: 30, gut: 0 },
    { mass: 20, gut: 20 * config.gutCapacity },
  ];

  it('shares prey by weight while the guts have room, and changes no gut itself', () => {
    const { taken, overflow } = swallow(eaters, [1, 3, 0], 0.01, config);
    expect(taken[1]).toBeCloseTo(3 * taken[0], 12);
    expect(taken[2]).toBe(0);
    expect(overflow).toBeCloseTo(0, 12);
    expect(eaters.map((e) => e.gut)).toEqual([0, 0, 20 * config.gutCapacity]);
  });

  it('takes no more than the room left in a gut, the rest overflowing, every gram accounted for', () => {
    const grams = 5;
    const { taken, overflow } = swallow(eaters, [1, 1, 1], grams, config);
    taken.forEach((g, i) => expect(g).toBeLessThanOrEqual(appetite(eaters[i], config) + 1e-15));
    expect(taken[2]).toBe(0);
    expect(overflow).toBeGreaterThan(0);
    expect(taken.reduce((sum, g) => sum + g, 0) + overflow).toBeCloseTo(grams, 12);
  });

  it('overflows everything when nobody weighs in', () => {
    expect(swallow(eaters, [0, 0, 0], 0.2, config)).toEqual({ taken: [0, 0, 0], overflow: 0.2 });
  });

  it('takes nothing of no prey', () => {
    expect(swallow(eaters, [1, 1, 1], 0, config)).toEqual({ taken: [0, 0, 0], overflow: 0 });
    expect(swallow(eaters, [0, 0, 0], 0, config)).toEqual({ taken: [0, 0, 0], overflow: 0 });
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
