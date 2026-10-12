import { describe, it, expect } from 'vitest';
import {
  appetite,
  digest,
  fullPaceLine,
  gutCapacity,
  gutRoom,
  ration,
  reserveYield,
  shareCapped,
  swallow,
  type Pace,
} from './digestion.js';
import { livestockDefaults as config } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { assimilationCeiling, stepDeb } from './deb.js';
import { NO_STRESS } from './reserve.js';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { DEFAULT_CONFIG, withTunable } from '../config/index.js';
import { FISH_COMPOSITION } from './fish-body.js';
import { fishRecord } from '../tests/fish.js';
import { LEAN, meal, ofFood, organicsCloseTo } from '../tests/organics.js';
import { ELEMENTS, foodRecipe, NO_ORGANICS, portion, scaleOrganics } from '../core/organics.js';
import type { Fish } from '../state.js';

const REFERENCE: Pace = { tau: 1, omega: 1, stress: NO_STRESS };
const guppy = (size: number, gut = 0): Fish => fishRecord({ species: 'guppy', size, gut: ofFood(gut) });

describe('appetite', () => {
  it('is the assimilation ceiling in food: {p_Am}·L² over κ_X', () => {
    const fish = guppy(50);
    const p = debParams('guppy');
    expect(appetite(fish, REFERENCE)).toBeCloseTo(assimilationCeiling(fish.budget, p, REFERENCE) / p.kappaX, 15);
  });

  it('rises with its surface, so a fry eats more for its weight than its parents', () => {
    const [fry, adult] = [guppy(20), guppy(80)];
    const surfaces = (adult.budget.structure / fry.budget.structure) ** (2 / 3);
    expect(appetite(adult, REFERENCE) / appetite(fry, REFERENCE)).toBeCloseTo(surfaces, 12);
    expect(appetite(fry, REFERENCE) / fry.budget.structure).toBeGreaterThan(appetite(adult, REFERENCE) / adult.budget.structure);
  });

  it('runs at τ·ω and falls with assimilation stress', () => {
    const fish = guppy(50);
    const base = appetite(fish, REFERENCE);
    expect(appetite(fish, { ...REFERENCE, tau: 1.5, omega: 0.5 })).toBeCloseTo(0.75 * base, 15);
    expect(appetite(fish, { ...REFERENCE, stress: { ...NO_STRESS, assimilation: 0.4 } })).toBeCloseTo(0.4 * base, 15);
  });
});

describe('reserveYield', () => {
  const p = debParams('guppy');

  it('builds at κ_X on a meal as rich as the body, so a fish eating fish is never short', () => {
    expect(reserveYield(FISH_COMPOSITION, FISH_COMPOSITION, p)).toBe(p.kappaX);
    expect(reserveYield(portion(FISH_COMPOSITION, 0.003), FISH_COMPOSITION, p)).toBe(p.kappaX);
    expect(reserveYield(meal(2, 'carbon', 1.2), FISH_COMPOSITION, p)).toBe(p.kappaX);
  });

  it('builds what its scarcest element allows of all but the κ_P passed, whichever element, whatever the meal weighs', () => {
    for (const e of ELEMENTS) {
      const lean = meal(1.5, e, 0.5);
      expect(reserveYield(lean, FISH_COMPOSITION, p)).toBeCloseTo((1 - p.kappaP) * 0.5, 12);
      expect(reserveYield(scaleOrganics(lean, 0.002), FISH_COMPOSITION, p)).toBeCloseTo(
        reserveYield(lean, FISH_COMPOSITION, p),
        12
      );
    }
  });

  it('builds nothing of nothing', () => {
    expect(reserveYield(NO_ORGANICS, FISH_COMPOSITION, p)).toBe(0);
  });

  it.each(Object.keys(FISH_SPECIES_DATA) as FishSpecies[])('builds a %s at κ_X on the default flake', (species) => {
    const params = debParams(species);
    expect(reserveYield(foodRecipe(DEFAULT_CONFIG), FISH_COMPOSITION, params)).toBe(params.kappaX);
  });
});

describe('ration', () => {
  const fish = guppy(50);
  const p = debParams('guppy');
  const { owed } = stepDeb(fish.budget, p, { fromGut: 0, ...REFERENCE }).fluxes;
  const flake = foodRecipe(DEFAULT_CONFIG);
  const lean = foodRecipe(withTunable(DEFAULT_CONFIG, 'livestock.foodCarbonFraction', 0.4));

  it('is the food whose assimilation pays the upkeep it owes, gram for gram, on any recipe', () => {
    for (const food of [flake, lean]) {
      const fromGut = ration(fish, owed, food);
      const fed = stepDeb(fish.budget, p, { fromGut, reserveYield: reserveYield(food, FISH_COMPOSITION, p), ...REFERENCE });
      expect(fed.fluxes.assimilated).toBeCloseTo(owed, 15);
      expect(fed.fluxes.returned).toBe(0);
    }
  });

  it('takes more of a leaner recipe, and no amount of one that builds nothing', () => {
    expect(ration(fish, owed, lean)).toBeGreaterThan(ration(fish, owed, flake));
    const unbuildable = foodRecipe(withTunable(DEFAULT_CONFIG, 'nutrients.foodMineralContent.phosphate', 0));
    expect(ration(fish, owed, unbuildable)).toBe(Infinity);
  });
});

describe('the gut', () => {
  it('holds a day of its appetite, and wants the room left in it', () => {
    const fish = guppy(50);
    expect(gutCapacity(fish, REFERENCE)).toBeCloseTo(HOURS_PER_DAY * appetite(fish, REFERENCE), 15);
    const half = { ...fish, gut: ofFood(gutCapacity(fish, REFERENCE) / 2) };
    expect(gutRoom(half, REFERENCE)).toBeCloseTo(gutCapacity(fish, REFERENCE) / 2, 15);
    expect(gutRoom({ ...fish, gut: ofFood(2 * gutCapacity(fish, REFERENCE)) }, REFERENCE)).toBe(0);
  });

  it('digests first order at τ: the same share of whatever it holds, every part of it', () => {
    expect(digest(ofFood(1), 1, config).grams).toBeCloseTo(hourlyDraw(config.digestionRate), 12);
    expect(digest(ofFood(2), 1.5, config).grams).toBeCloseTo(2 * hourlyDraw(1.5 * config.digestionRate), 12);
    expect(digest(ofFood(1), 0, config)).toEqual(NO_ORGANICS);
    expect(digest(ofFood(1), 1e6, config).grams).toBeLessThanOrEqual(1);
    const mixed = portion(LEAN, 2);
    expect(digest(mixed, 1, config)).toEqual(organicsCloseTo(scaleOrganics(mixed, hourlyDraw(config.digestionRate)), 15));
  });

  it('draws the full-pace line where a gut that full digests what the budget can take up in the hour', () => {
    for (const tau of [1, 1.6]) {
      const fish = guppy(50);
      const pace = { ...REFERENCE, tau };
      const line = fullPaceLine(tau, config) * gutCapacity(fish, pace);
      expect(digest(ofFood(line), tau, config).grams).toBeCloseTo(appetite(fish, pace), 12);
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
  const school = (): Fish[] => [guppy(30), guppy(60), guppy(50, gutCapacity(guppy(50), REFERENCE))];
  const paces = [REFERENCE, REFERENCE, REFERENCE];

  it('takes each share while the gut has room, leaving the eaters as they were', () => {
    const eaters = Object.freeze(school().map((e) => Object.freeze(e)));
    const shares = [1e-5, 3e-5, 0];
    expect(swallow(eaters, paces, shares)).toEqual({ taken: shares, overflow: 0 });
    expect(eaters.map((e) => e.gut.grams)).toEqual([0, 0, gutCapacity(guppy(50), REFERENCE)]);
  });

  it('takes no more than a gut has room for, the rest overflowing, every gram accounted for', () => {
    const eaters = school();
    const { taken, overflow } = swallow(eaters, paces, [5, 5, 5]);
    eaters.forEach((e, i) => expect(e.gut.grams + taken[i]).toBeLessThanOrEqual(gutCapacity(e, REFERENCE) + 1e-15));
    expect(overflow).toBeGreaterThan(0);
    expect(taken.reduce((sum, g) => sum + g, 0) + overflow).toBeCloseTo(15, 12);
  });
});
