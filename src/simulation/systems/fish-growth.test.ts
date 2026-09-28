import { describe, it, expect } from 'vitest';
import type { Clutch, Fish } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { livestockDefaults as config } from '../config/livestock.js';
import {
  ADULT_SIZE,
  brood,
  broodShare,
  eggOrganics,
  eggsLaid,
  fishLifeStage,
  fishSize,
  frySize,
  growFish,
  massAtSize,
  offspringFathered,
  ovaryAsked,
  paysTowardBrood,
  readyToBrood,
} from './fish-growth.js';
import { metabolicMass } from './digestion.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

function fish(o: Partial<Fish> & { size?: number } = {}): Fish {
  const { size = 100, ...rest } = o;
  const species = rest.species ?? 'guppy';
  const made: Fish = {
    id: 'f',
    species,
    mass: massAtSize(species, size),
    health: 100,
    age: 0,
    gut: 0,
    sex: 'female',
    hardinessOffset: 0,
    surplus: config.surplusCap,
    ovary: 0,
    ...rest,
  };
  return { ...made, ovary: rest.ovary ?? (made.sex === 'female' ? eggsLaid(made, config) : 0) };
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
  const PLENTY = 1;

  const specificGain = (f: Fish, assimilated = PLENTY): number => growFish(f, assimilated, config).fish.mass / f.mass - 1;

  it('grows a fed fry toward adult size at a specific rate that only falls, never reaching it', () => {
    for (const species of SPECIES) {
      let f = fish({ species, size: frySize(species) });
      let lastRate = Infinity;
      while (fishSize(f) < 99) {
        const before = f.mass;
        f = growFish({ ...f, surplus: config.surplusCap }, PLENTY, config).fish;
        const rate = f.mass / before - 1;
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThanOrEqual(lastRate);
        lastRate = rate;
      }
      expect(fishSize(f)).toBeLessThan(100);
    }
  });

  it('asks, per gram, on mass to the −¼ at small size, tapering to nothing at adult size', () => {
    const unlimited = (size: number): number => specificGain(fish({ size }), 1e9);
    const tiny = unlimited(0.01);
    const kleiber = (size: number): number => (size / 0.01) ** config.massScalingExponent;
    for (const size of [0.02, 0.16, 1, 50, 95]) {
      expect(unlimited(size) / (tiny * kleiber(size))).toBeCloseTo((1 - size / 100) / 0.9999, 3);
    }
  });

  it('grows a thin-fed fry on the same mass scaling, its food and its asking both running on its metabolic mass', () => {
    const thin = (size: number): number => {
      const f = fish({ size });
      return specificGain(f, metabolicMass(f, config) * 1e-4);
    };
    expect(thin(0.02) / thin(0.01)).toBeCloseTo(2 ** config.massScalingExponent, 4);
    expect(thin(0.02)).toBeLessThan(specificGain(fish({ size: 0.02 })) / 2);
  });

  it('draws the bank down by exactly the points it grew on', () => {
    const f = fish({ size: 30, surplus: 20 });
    for (const supply of [PLENTY, 1e-4]) {
      const grown = growFish(f, supply, config).fish;
      const drawn = f.surplus - grown.surplus;
      const { growthRate } = FISH_SPECIES_DATA.guppy;

      expect(drawn).toBeGreaterThan(0);
      const perGram = metabolicMass(f, config) / f.mass;
      expect(grown.mass / f.mass - 1).toBeCloseTo((drawn * growthRate * config.growthPerSurplus * perGram) / 100, 12);
    }
  });

  it('builds its new mass of exactly the food it retains', () => {
    const f = fish({ size: 30, surplus: 20 });
    const { fish: grown, retained } = growFish(f, 1e-4, config);
    expect(retained).toBeGreaterThan(0);
    expect((grown.mass - f.mass) * config.bodyOrganicShare).toBeCloseTo(retained, 15);
  });

  it('never retains more than growth can use of what it assimilated, and slows smoothly as that falls short: half its asking at its asking', () => {
    const f = fish({ size: 10, surplus: 40 });
    const asked = growFish(f, 1e9, config).retained;
    const assimilatedFor = (supply: number): number => supply / config.growthEfficiency;
    let last = 0;
    for (const supply of [asked / 100, asked / 10, asked / 2, asked, 2 * asked, 10 * asked]) {
      const { retained } = growFish(f, assimilatedFor(supply), config);
      expect(retained).toBeLessThan(supply);
      expect(retained).toBeGreaterThan(last);
      last = retained;
    }
    expect(growFish(f, assimilatedFor(asked), config).retained).toBeCloseTo(asked / 2, 12);
    expect(growFish(f, 0, config).retained).toBe(0);
  });

  it('buys and retains nothing on an empty bank or at adult size', () => {
    const empty = fish({ size: 20, surplus: 0 });
    const grown = fish({ size: 100 });
    expect(growFish(empty, PLENTY, config)).toEqual({ fish: empty, retained: 0 });
    expect(growFish(grown, PLENTY, config)).toEqual({ fish: grown, retained: 0 });
  });

  it('a fry on a fuller bank grows faster than one on a thin bank', () => {
    const full = growFish(fish({ size: 10, surplus: 40 }), PLENTY, config).fish;
    const thin = growFish(fish({ size: 10, surplus: 5 }), PLENTY, config).fish;
    expect(full.mass).toBeGreaterThan(thin.mass);
  });
});

describe('the ovary', () => {
  const PLENTY = 1;

  it('asks for the eggs her brood share buys that it does not hold, and nothing of a male', () => {
    const she = fish({ ovary: 0 });
    expect(ovaryAsked(she, config)).toBeCloseTo(eggsLaid(she, config) * eggOrganics('guppy', config), 15);
    expect(ovaryAsked({ ...she, ovary: eggsLaid(she, config) / 4 }, config)).toBeCloseTo((3 / 4) * ovaryAsked(she, config), 15);
    expect(ovaryAsked(fish(), config)).toBe(0);
    expect(ovaryAsked(fish({ sex: 'male', ovary: 0 }), config)).toBe(0);
    expect(ovaryAsked(fish({ ovary: 0, surplus: 0 }), config)).toBe(0);
  });

  it('builds her eggs from her supply, never more than it, her body keeping its mass', () => {
    const she = fish({ ovary: 0 });
    for (const supply of [0, 1e-7, 1e-5, 1e-3, PLENTY]) {
      const { fish: after, retained } = growFish(she, supply, config);
      expect((after.ovary - she.ovary) * eggOrganics('guppy', config)).toBeCloseTo(retained, 15);
      expect(retained).toBeLessThanOrEqual(supply * config.growthEfficiency);
      expect(after.mass).toBe(she.mass);
      expect(after.surplus).toBe(she.surplus);
      expect(Number.isFinite(after.ovary)).toBe(true);
    }
    expect(growFish(she, 1e-5, config).fish.ovary).toBeLessThan(growFish(she, PLENTY, config).fish.ovary);
  });

  it('shares one supply with growth in proportion to what each asks, the ledger exact', () => {
    const she = fish({ size: 70, ovary: 0, surplus: 30 });
    const alone = { ...she, sex: 'male' as const };
    const grownAsk = growFish(alone, 1e9, config).retained;
    const eggAsk = ovaryAsked(she, config);
    for (const supply of [1e-6, 1e-4, PLENTY]) {
      const { fish: after, retained } = growFish(she, supply, config);
      const grown = (after.mass - she.mass) * config.bodyOrganicShare;
      const yolked = (after.ovary - she.ovary) * eggOrganics('guppy', config);
      expect(grown + yolked).toBeCloseTo(retained, 15);
      expect(yolked / eggAsk).toBeCloseTo(grown / grownAsk, 6);
      expect(retained).toBeLessThan(supply * config.growthEfficiency);
    }
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
    const perEgg = config.broodCost * (FISH_SPECIES_DATA.guppy.breeding.eggMass / female.mass);
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
    const perPoint = (f: Fish): number => f.mass / (config.broodCost * FISH_SPECIES_DATA[f.species].breeding.eggMass);
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

  it('makes the fathered eggs of her ovary, every body untouched', () => {
    const she = fish();
    const male = fish({ sex: 'male' });
    const result = brood([she], [male], config);
    expect(result.offspring[0]).toBeGreaterThan(0);
    expect(she.ovary - result.females[0].ovary).toBe(result.offspring[0]);
    expect(result.females[0].mass).toBe(she.mass);
    expect(result.males[0].mass).toBe(male.mass);
  });

  it('lays no more eggs than her ovary holds, and pays for the brood her bank bought', () => {
    const full = fish();
    const bought = Math.floor(eggsLaid(full, config));
    const male = fish({ sex: 'male' });
    for (const share of [0, 0.3, 0.7, 1]) {
      const she = { ...full, ovary: share * full.ovary };
      const result = brood([she], [male], config);
      expect(result.offspring[0]).toBeLessThanOrEqual(Math.floor(she.ovary));
      expect(result.females[0].ovary).toBeGreaterThanOrEqual(0);
      expect(she.surplus - result.females[0].surplus).toBeCloseTo((bought / eggsLaid(full, config)) * full.surplus, 10);
    }
    expect(brood([{ ...full, ovary: 0.3 * full.ovary }], [male], config).offspring[0]).toBeLessThan(
      brood([full], [male], config).offspring[0]
    );
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
