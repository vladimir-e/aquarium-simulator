import { describe, it, expect } from 'vitest';
import type { Clutch, Fish } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { livestockDefaults as config } from '../config/livestock.js';
import {
  ADULT_SIZE,
  brood,
  broodShare,
  eggsLaid,
  fishLifeStage,
  fishSize,
  frySize,
  growFish,
  massAtSize,
  offspringFathered,
  paysTowardBrood,
  readyToBrood,
} from './fish-growth.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

function fish(o: Partial<Fish> & { size?: number } = {}): Fish {
  const { size = 100, ...rest } = o;
  const species = rest.species ?? 'guppy';
  return {
    id: 'f',
    species,
    mass: massAtSize(species, size),
    health: 100,
    age: 0,
    gut: 0,
    sex: 'female',
    hardinessOffset: 0,
    surplus: config.surplusCap,
    ...rest,
  };
}

describe('size', () => {
  it('reads mass as a share of adult mass, both ways', () => {
    for (const species of SPECIES) {
      expect(fishSize({ species, mass: massAtSize(species, 37) })).toBeCloseTo(37, 10);
    }
  });

  it('reads fry under ADULT_SIZE and adult from it', () => {
    expect(fishLifeStage({ species: 'guppy', mass: massAtSize('guppy', ADULT_SIZE - 1) })).toBe('fry');
    expect(fishLifeStage({ species: 'guppy', mass: massAtSize('guppy', ADULT_SIZE) })).toBe('adult');
  });
});

describe('broodShare', () => {
  it('rises smoothly from nothing for a newborn to all of it at adult size', () => {
    expect(broodShare(0)).toBe(0);
    expect(broodShare(100)).toBe(1);
    for (let size = 1; size <= 100; size++) {
      const step = broodShare(size) - broodShare(size - 1);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(0.02);
    }
  });

  it('never gives a fish past adult size more than its whole bank to brood on', () => {
    expect(broodShare(120)).toBe(1);
    expect(broodShare(-5)).toBe(0);
  });
});

describe('growFish', () => {
  it('grows a fry toward adult size, ever slower, never reaching it', () => {
    for (const species of SPECIES) {
      let f = fish({ species, size: frySize(species) });
      let lastGain = Infinity;
      for (let hour = 0; hour < 24 * 365; hour++) {
        const before = f.mass;
        f = growFish({ ...f, surplus: config.surplusCap }, config);
        const gain = f.mass - before;
        expect(gain).toBeGreaterThan(0);
        expect(gain).toBeLessThanOrEqual(lastGain);
        lastGain = gain;
      }
      expect(fishSize(f)).toBeLessThan(100);
      expect(fishSize(f)).toBeGreaterThan(90);
    }
  });

  it('draws the bank down by exactly the points it grew on', () => {
    const f = fish({ size: 30, surplus: 20 });
    const grown = growFish(f, config);
    const drawn = f.surplus - grown.surplus;
    const { growthRate } = FISH_SPECIES_DATA.guppy;

    expect(drawn).toBeGreaterThan(0);
    expect(fishSize(grown) - fishSize(f)).toBeCloseTo(drawn * growthRate * config.sizePerSurplus, 10);
  });

  it('buys nothing on an empty bank or at adult size', () => {
    const empty = fish({ size: 20, surplus: 0 });
    const grown = fish({ size: 100 });
    expect(growFish(empty, config)).toBe(empty);
    expect(growFish(grown, config)).toBe(grown);
  });

  it('a starved fry grows slower than a fed one', () => {
    const fed = growFish(fish({ size: 10, surplus: 40 }), config);
    const starved = growFish(fish({ size: 10, surplus: 5 }), config);
    expect(fed.mass).toBeGreaterThan(starved.mass);
  });
});

describe('brood', () => {
  it('scales its eggs with the brood share of the bank and the female’s mass', () => {
    const grown = eggsLaid(fish({ size: 100 }), config);
    const half = eggsLaid(fish({ size: 50 }), config);
    const halfBank = eggsLaid(fish({ size: 100, surplus: config.surplusCap / 2 }), config);

    expect(half).toBeCloseTo(grown / 4, 10);
    expect(halfBank).toBeCloseTo(grown / 2, 10);
  });

  it('costs a parent in proportion to the brood it lays', () => {
    const female = fish({ size: 100 });
    const perEgg = config.broodCost * (massAtSize('guppy', frySize('guppy')) / female.mass);
    expect(eggsLaid(female, config) * perEgg).toBeCloseTo(broodShare(100) * female.surplus, 10);
  });

  it('has every species’ male pay a share of a brood', () => {
    for (const species of SPECIES) expect(FISH_SPECIES_DATA[species].breeding.maleShare).toBeGreaterThan(0);
  });

  it('costs the male his species’ share of what it costs her', () => {
    for (const species of SPECIES) {
      const female = fish({ species });
      const male = fish({ species, sex: 'male' });
      expect(offspringFathered(male, config) * FISH_SPECIES_DATA[species].breeding.maleShare).toBeCloseTo(
        eggsLaid(female, config),
        10
      );
    }
  });

  it('a male with an empty bank fathers nothing, and she still pays for the eggs she laid', () => {
    const she = fish();
    const result = brood([she], [fish({ sex: 'male', surplus: 0 })], config);
    const laid = Math.floor(eggsLaid(she, config));

    expect(result.offspring).toEqual([0]);
    expect(she.surplus - result.females[0].surplus).toBeCloseTo(laid / eggsLaid(she, config) * she.surplus, 10);
  });

  it('a female too small to lay a whole egg keeps her bank', () => {
    const small = fish({ size: frySize('guppy') * 2 });
    expect(Math.floor(eggsLaid(small, config))).toBe(0);

    const result = brood([small], [fish({ sex: 'male' })], config);
    expect(result.offspring).toEqual([0]);
    expect(result.females[0].surplus).toBe(small.surplus);
    expect(readyToBrood(small, [], config)).toBe(false);
  });

  it('a female carrying a brood is not ready for another', () => {
    const she = fish({ id: 'she' });
    const carried: Clutch = { id: 'c', species: 'guppy', eggs: 10, development: 0.5, motherId: 'she' };
    const another: Clutch = { ...carried, motherId: 'her-sister' };
    expect(readyToBrood(she, [], config)).toBe(true);
    expect(readyToBrood(she, [another], config)).toBe(true);
    expect(readyToBrood(she, [carried], config)).toBe(false);
  });

  it('a male pays toward a brood only with a brood bank to pay from', () => {
    expect(paysTowardBrood(fish({ sex: 'male' }))).toBe(true);
    expect(paysTowardBrood(fish({ sex: 'male', surplus: 0 }))).toBe(false);
  });

  it('each brood drains the male, so one male cannot father brood after brood', () => {
    let male = fish({ sex: 'male' });
    const broods: number[] = [];
    for (let i = 0; i < 10; i++) {
      const result = brood([fish()], [male], config);
      male = result.males[0];
      broods.push(result.offspring[0]);
    }
    expect(broods[0]).toBeGreaterThan(0);
    expect(broods.at(-1)).toBeLessThan(broods[0]);
    expect(male.surplus).toBeLessThan(config.surplusCap);
  });

  it('males pay the same share of their brood banks, and only for what they father', () => {
    const males = [fish({ sex: 'male', surplus: 10 }), fish({ sex: 'male', surplus: 40 })];
    const result = brood([fish()], males, config);
    const shares = result.males.map((m, i) => (males[i].surplus - m.surplus) / (broodShare(100) * males[i].surplus));

    expect(result.offspring[0]).toBeGreaterThan(0);
    expect(shares[0]).toBeCloseTo(shares[1], 10);
    expect(shares[0]).toBeLessThanOrEqual(1);
  });

  describe('settles the ready females of a species together', () => {
    const perPoint = (f: Fish): number => f.mass / (config.broodCost * massAtSize(f.species, frySize(f.species)));
    const cases: [Fish[], Fish[]][] = [];
    for (const species of SPECIES) {
      for (const bank of [0, 3, 10, 25, config.surplusCap]) {
        const females = [100, 73, 50, 41].map((size, i) => fish({ id: `f${i}`, species, size }));
        const males = [fish({ species, sex: 'male', size: 60, surplus: bank }), fish({ species, sex: 'male', surplus: bank / 3 })];
        cases.push([females, males]);
      }
    }

    it('gives no female more than her eggs, and every offspring the males pay for', () => {
      for (const [females, males] of cases) {
        const eggs = females.map((f) => Math.floor(eggsLaid(f, config)));
        const fathering = males.reduce((total, m) => total + offspringFathered(m, config), 0);
        const { offspring } = brood(females, males, config);

        offspring.forEach((n, i) => expect(n).toBeLessThanOrEqual(eggs[i]));
        expect(offspring.reduce((a, b) => a + b, 0)).toBe(Math.floor(Math.min(eggs.reduce((a, b) => a + b, 0), fathering)));
      }
    });

    it('charges the males exactly the offspring they father, at their share', () => {
      for (const [females, males] of cases) {
        const result = brood(females, males, config);
        const { maleShare } = FISH_SPECIES_DATA[males[0].species].breeding;
        const bought = males.reduce((total, m, i) => total + ((m.surplus - result.males[i].surplus) * perPoint(m)) / maleShare, 0);

        expect(bought).toBeCloseTo(result.offspring.reduce((a, b) => a + b, 0), 8);
      }
    });

    it('settles the same whichever female was stocked first', () => {
      for (const [females, males] of cases) {
        const forward = brood(females, males, config).offspring;
        const backward = brood([...females].reverse(), males, config).offspring.reverse();
        expect(backward).toEqual(forward);
      }
    });
  });

  it('keeps every bank finite and non-negative', () => {
    for (const species of SPECIES) {
      for (const size of [frySize(species), 50, 100]) {
        const result = brood(
          [fish({ species, size }), fish({ species })],
          [fish({ species, sex: 'male', size }), fish({ species, sex: 'male', size, surplus: 0 })],
          config
        );
        for (const n of result.offspring) expect(Number.isInteger(n)).toBe(true);
        for (const f of [...result.females, ...result.males]) {
          expect(Number.isFinite(f.surplus)).toBe(true);
          expect(f.surplus).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
