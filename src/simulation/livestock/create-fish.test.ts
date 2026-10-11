import { describe, it, expect } from 'vitest';
import {
  HARDINESS_OFFSET_SPAN,
  HEALTH_JITTER,
  hatchFish,
  isStockableSize,
  MAX_STOCKED_SIZE,
  raise,
  stockedBody,
  stockFish,
} from './create-fish.js';
import { createRng, draw } from '../core/rng.js';
import { debParams, FISH_SPECIES_DATA, midRangeTemperature, type FishSpecies } from './species.js';
import { hatchling, mature, size } from '../systems/deb.js';
import { wellFed } from '../systems/reserve.js';
import { frySize } from '../systems/fish-body.js';
import { ZERO_TOXINS } from '../config/livestock.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];
const stock = (o: Partial<Parameters<typeof stockFish>[0]> = {}): ReturnType<typeof stockFish> =>
  stockFish({ species: 'guppy', size: 60, rng: createRng(1), ...o });
const hatch = (o: Partial<Parameters<typeof hatchFish>[0]> = {}): ReturnType<typeof hatchFish> =>
  hatchFish({ species: 'corydoras', rng: createRng(2), load: ZERO_TOXINS, ...o });

describe('a fish raised in the shop', () => {
  it.each(SPECIES)('arrives as a %s at the size named, on a full reserve and with no brood', (species) => {
    const p = debParams(species);
    for (const target of [frySize(species), frySize(species) + 1, 40, MAX_STOCKED_SIZE]) {
      const { budget } = stockedBody(species, target);
      expect(size(budget, p)).toBeGreaterThanOrEqual(target);
      expect(size(budget, p) - target).toBeLessThan(0.1);
      expect(wellFed(budget, p)).toBeGreaterThan(0.99);
      expect(budget.broodBuffer).toBe(0);
    }
  });

  it.each(SPECIES)('arrives as a %s larger, older and worn further the larger it is named', (species) => {
    const bodies = [frySize(species) + 1, 30, 55, 80, MAX_STOCKED_SIZE].map((target) => stockedBody(species, target));
    for (let i = 1; i < bodies.length; i++) {
      expect(bodies[i].budget.structure).toBeGreaterThan(bodies[i - 1].budget.structure);
      expect(bodies[i].age).toBeGreaterThan(bodies[i - 1].age);
      expect(bodies[i].survival).toBeLessThan(bodies[i - 1].survival);
    }
  });

  it.each(SPECIES)('reaches a %s’s size younger raised warmer', (species) => {
    const p = debParams(species);
    const [cool, warm] = [22, 28].map((temperature) => raise(species, 60, temperature));
    expect(size(warm.budget, p)).toBeCloseTo(size(cool.budget, p), 1);
    expect(warm.hours).toBeLessThan(cool.hours);
  });

  it('is the one raised at its species’ mid-range temperature, whatever tank buys it', () => {
    const raised = raise('neon_tetra', 55, midRangeTemperature('neon_tetra'));
    expect(stockedBody('neon_tetra', 55)).toEqual({ budget: raised.budget, survival: raised.survival, age: raised.hours });
  });

  it('is grown past puberty at the stocking size for a fast grower, short of it for a slow one', () => {
    expect(mature(stockedBody('guppy', 80).budget, debParams('guppy'))).toBe(true);
    expect(mature(stockedBody('angelfish', 80).budget, debParams('angelfish'))).toBe(false);
  });

  it('draws its survival threshold under the survival it arrives with, so the shop’s dead are never sold', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const fish = stockFish({ species: 'guppy', size: MAX_STOCKED_SIZE, rng });
      expect(fish.survivalDraw).toBeLessThan(fish.survival);
      expect(fish.survivalDraw).toBeGreaterThanOrEqual(0);
    }
  });

  it('is stocked from a hatchling’s size up to the most a shop sells, and no further', () => {
    expect(isStockableSize('guppy', frySize('guppy'))).toBe(true);
    expect(isStockableSize('guppy', frySize('guppy') - 0.01)).toBe(false);
    expect(isStockableSize('guppy', MAX_STOCKED_SIZE)).toBe(true);
    expect(isStockableSize('guppy', 100)).toBe(false);
    expect(isStockableSize('guppy', NaN)).toBe(false);
  });

  it('is never raised to a size no fish is stocked at', () => {
    for (const target of [NaN, frySize('guppy') - 0.01, MAX_STOCKED_SIZE + 0.01, 100]) {
      expect(() => stockedBody('guppy', target)).toThrow(RangeError);
      expect(() => raise('guppy', target, 25)).toThrow(RangeError);
    }
  });
});

describe('a hatched fish', () => {
  it('is its species’ hatchling, aged 0 with its whole cohort alive and an empty gut', () => {
    const fry = hatch();
    expect(fry.budget).toEqual(hatchling(debParams('corydoras')));
    expect([fry.age, fry.survival, fry.gut]).toEqual([0, 1, 0]);
  });
});

describe('every new fish', () => {
  it('arrives unloaded from the shop, and hatches carrying what its clutch read', () => {
    const read = { ammonia: 0.05, nitrite: 1, nitrate: 40 };
    expect(stock().load).toEqual(ZERO_TOXINS);
    expect(hatch({ load: read }).load).toEqual(read);
  });
});

describe('individual variation', () => {
  it('takes an explicit sex instead of sampling one', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 100; i++) expect(stock({ sex: 'female', rng }).sex).toBe('female');
  });

  it('draws the same stream whether or not it was given a sex', () => {
    const sampled = stock({ rng: createRng(3) });
    const named = stock({ sex: 'male', rng: createRng(3) });
    expect(named.hardinessOffset).toBe(sampled.hardinessOffset);
    expect(named.health).toBe(sampled.health);
    expect(named.survivalDraw).toBe(sampled.survivalDraw);
  });

  it('leaves the stream where the next fish expects it', () => {
    const build = (sex?: 'male' | 'female'): { fish: ReturnType<typeof stockFish>; at: number } => {
      const rng = createRng(3);
      stock({ sex, rng });
      return { fish: stock({ rng }), at: rng.counter };
    };
    expect(build('female')).toEqual(build());
  });

  it('keeps hardiness offset within the offset span of the species baseline, and health within the jitter', () => {
    const rng = createRng(999);
    const maxAbs = HARDINESS_OFFSET_SPAN * FISH_SPECIES_DATA.neon_tetra.hardiness;
    for (let i = 0; i < 500; i++) {
      const f = hatch({ species: 'neon_tetra', rng });
      expect(Math.abs(f.hardinessOffset)).toBeLessThanOrEqual(maxAbs + 1e-9);
      expect(f.health).toBeGreaterThanOrEqual(100 - HEALTH_JITTER);
      expect(f.health).toBeLessThanOrEqual(100);
    }
  });

  it('spends its four draws on sex, hardiness, health and survival, in that order', () => {
    const rng = createRng(1);
    const probe = { ...rng };
    const [sexDraw, hardinessDraw, healthDraw, survivalDraw] = [draw(probe), draw(probe), draw(probe), draw(probe)];
    const { hardiness } = FISH_SPECIES_DATA.neon_tetra;

    const fish = hatch({ species: 'neon_tetra', rng });

    expect(fish.sex).toBe(sexDraw < 0.5 ? 'male' : 'female');
    expect(fish.hardinessOffset).toBeCloseTo((hardinessDraw - 0.5) * 2 * HARDINESS_OFFSET_SPAN * hardiness, 12);
    expect(fish.health).toBeCloseTo(100 + (healthDraw - 0.5) * 2 * HEALTH_JITTER, 12);
    expect(fish.survivalDraw).toBe(survivalDraw);
  });

  it('names every fish off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(hatch({ species: 'guppy', rng }).id);
    expect(ids.size).toBe(1000);
  });

  it('builds the same fish from the same seed — another seed rerolls all but the id', () => {
    const build = (seed: number): ReturnType<typeof stockFish> => stock({ rng: createRng(seed) });
    expect(build(11)).toEqual(build(11));
    expect(build(11)).not.toEqual(build(12));
    expect(build(11).id).toBe(build(12).id);
  });
});
