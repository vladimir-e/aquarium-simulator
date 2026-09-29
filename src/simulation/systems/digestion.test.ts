import { describe, it, expect } from 'vitest';
import {
  appetite,
  arrivalGut,
  dailyMaintenance,
  digest,
  gutCapacity,
  hungerLine,
  maintenance,
  metabolicMass,
  nourishment,
  shareCapped,
  swallow,
} from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';

const guppy = (mass: number): { species: 'guppy'; mass: number } => ({ species: 'guppy', mass });
const ADULT = FISH_SPECIES_DATA.guppy.adultMass;

describe('mass scaling', () => {
  const perGram = (read: (fish: ReturnType<typeof guppy>) => number, mass: number): number => read(guppy(mass)) / mass;
  const rates = {
    capacity: (fish: ReturnType<typeof guppy>): number => gutCapacity(fish, config),
    digestion: (fish: ReturnType<typeof guppy>): number => digest(gutCapacity(fish, config), 1, config),
    maintenance: (fish: ReturnType<typeof guppy>): number => maintenance(fish, 1, config),
  };

  it('runs a fish per gram on its mass to the −¼ against a grown fish of its species', () => {
    for (const [name, read] of Object.entries(rates)) {
      expect(perGram(read, ADULT / 16) / perGram(read, ADULT), name).toBeCloseTo(2, 9);
      expect(perGram(read, ADULT / 10_000) / perGram(read, ADULT), name).toBeCloseTo(10, 9);
    }
    expect(metabolicMass(guppy(ADULT / 81), config) / (ADULT / 81)).toBeCloseTo(3, 12);
  });

  it('leaves a grown fish at the per-gram constants', () => {
    expect(metabolicMass(guppy(ADULT), config)).toBeCloseTo(ADULT, 12);
    expect(gutCapacity(guppy(ADULT), config)).toBeCloseTo(ADULT * config.gutCapacity, 12);
    expect(dailyMaintenance([guppy(ADULT)], 1, config)).toBeCloseTo(ADULT * config.maintenanceRation, 12);
  });

  it('scales every grown species alike: the reference is its own adult mass', () => {
    const neon = { species: 'neon_tetra' as const, mass: FISH_SPECIES_DATA.neon_tetra.adultMass };
    expect(metabolicMass(neon, config)).toBeCloseTo(neon.mass, 12);
    expect(gutCapacity(neon, config) / neon.mass).toBeCloseTo(config.gutCapacity, 12);
  });

  it('is flat at a zero exponent', () => {
    const flat = { ...config, massScalingExponent: 0 };
    expect(metabolicMass(guppy(ADULT / 100), flat)).toBeCloseTo(ADULT / 100, 12);
  });

  it('holds no NaN at tiny or zero mass', () => {
    for (const mass of [0, 1e-12]) {
      const fish = guppy(mass);
      const numbers = [metabolicMass(fish, config), gutCapacity(fish, config), maintenance(fish, 1, config), arrivalGut(fish, config)];
      numbers.forEach((n) => expect(Number.isFinite(n)).toBe(true));
    }
    expect(metabolicMass(guppy(0), config)).toBe(0);
  });

  it('arrives with a day\'s maintenance ration in its gut', () => {
    expect(arrivalGut(guppy(ADULT / 50), config)).toBeCloseTo(dailyMaintenance([guppy(ADULT / 50)], 1, config), 12);
  });
});

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
  it('needs a day\'s ration by metabolic mass in reference water', () => {
    expect(dailyMaintenance([guppy(1), guppy(0.25)], 1, config)).toBeCloseTo(
      (metabolicMass(guppy(1), config) + metabolicMass(guppy(0.25), config)) * config.maintenanceRation,
      12
    );
  });

  it('needs less as its metabolism slows, in step with the factor', () => {
    expect(dailyMaintenance([guppy(2)], 0.5, config)).toBeCloseTo(0.5 * dailyMaintenance([guppy(2)], 1, config), 12);
    expect(maintenance(guppy(1), 0.5, config)).toBeCloseTo(0.5 * maintenance(guppy(1), 1, config), 12);
    expect(maintenance(guppy(1), 0, config)).toBe(0);
  });
});

describe('appetite', () => {
  it('wants the room left in its gut, and nothing when full', () => {
    const fish = { ...guppy(2), gut: 0 };
    expect(appetite(fish, config)).toBeCloseTo(gutCapacity(fish, config), 12);
    expect(appetite({ ...guppy(2), gut: gutCapacity(fish, config) }, config)).toBe(0);
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
  const school = (): { species: 'guppy'; mass: number; gut: number }[] => [
    { ...guppy(10), gut: 0 },
    { ...guppy(30), gut: 0 },
    { ...guppy(20), gut: gutCapacity(guppy(20), config) },
  ];

  it('takes each share while the gut has room, leaving the eaters as they were', () => {
    const eaters = Object.freeze(school().map((e) => Object.freeze(e)));
    expect(swallow(eaters, [0.001, 0.003, 0], config)).toEqual({ taken: [0.001, 0.003, 0], overflow: 0 });
    expect(eaters.map((e) => e.gut)).toEqual([0, 0, gutCapacity(guppy(20), config)]);
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
    const need = maintenance(guppy(1), 1, config);
    expect(nourishment(need, need)).toBeCloseTo(0.5, 12);
    expect(nourishment(3 * need, need)).toBeGreaterThan(nourishment(2 * need, need));
    expect(nourishment(0, need)).toBe(0);
  });

  it('draws the hunger line where a gut that full digests its maintenance, at any metabolic factor and mass', () => {
    for (const fish of [guppy(2), guppy(0.005)]) {
      for (const factor of [1, 0.4]) {
        const gut = hungerLine(factor, config) * gutCapacity(fish, config);
        expect(digest(gut, factor, config)).toBeCloseTo(maintenance(fish, factor, config), 12);
      }
    }
    expect(hungerLine(0, config)).toBe(0);
  });
});
