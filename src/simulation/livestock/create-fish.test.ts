import { describe, it, expect } from 'vitest';
import {
  HARDINESS_OFFSET_SPAN,
  HEALTH_JITTER,
  hatchFish,
  isStockableSize,
  MAX_STOCKED_SIZE,
  stockedBody,
  stockFish,
} from './create-fish.js';
import { createRng, draw } from '../core/rng.js';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from './species.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { assimilationCeiling, hatchling, maxReserveDensity, mature, size, stepDeb } from '../systems/deb.js';
import { frySize } from '../systems/fish-body.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];
const stock = (o: Partial<Parameters<typeof stockFish>[0]> = {}): ReturnType<typeof stockFish> =>
  stockFish({ species: 'guppy', size: 60, temperature: 25, rng: createRng(1), ...o });

describe('a stocked fish', () => {
  it.each(SPECIES)('arrives as a %s the shop raised to its size, a full reserve and no brood', (species) => {
    const p = debParams(species);
    for (const target of [frySize(species) + 1, 40, MAX_STOCKED_SIZE]) {
      const { deb } = stockedBody(species, target, 25);
      expect(size(deb, p)).toBeGreaterThanOrEqual(target);
      expect(deb.reserve / (maxReserveDensity(p) * deb.structure)).toBeGreaterThan(0.99);
      expect(deb.broodBuffer).toBe(0);
    }
  });

  it('is the hour the shop’s feast first reaches its size', () => {
    const p = debParams('neon_tetra');
    const { deb, age, survival } = stockedBody('neon_tetra', 55, 20);
    let [state, hours, alive] = [hatchling(p), 0, 1];
    while (size(state, p) < 55) {
      const fromGut = assimilationCeiling(state, p, { tau: 1, omega: 1 }) / p.kappaX;
      alive *= Math.exp(-state.hazard);
      state = { ...stepDeb(state, p, { fromGut, tau: 1, omega: 1 }).state, broodBuffer: 0 };
      hours++;
    }
    expect(deb).toEqual(state);
    expect(age).toBe(hours);
    expect(survival).toBe(alive);
  });

  it('grew on the same path warm, only sooner, wearing at τ² and hazarded at τ', () => {
    const p = debParams('guppy');
    const cool = stockedBody('guppy', 60, 20);
    const warm = stockedBody('guppy', 60, 28);
    const tau = arrheniusFactor(28, p.TA);
    expect(warm.deb.structure).toBe(cool.deb.structure);
    expect(warm.deb.maturity).toBe(cool.deb.maturity);
    expect(warm.deb.wearLoad).toBeCloseTo(cool.deb.wearLoad * tau * tau, 20);
    expect(warm.deb.hazard).toBeCloseTo(cool.deb.hazard * tau, 20);
    expect(warm.age).toBe(Math.round(cool.age / tau));
    expect(warm.survival).toBe(cool.survival);
  });

  it('is grown past puberty at the stocking size for a fast grower, short of it for a slow one', () => {
    expect(mature(stockedBody('guppy', 80, 25).deb, debParams('guppy'))).toBe(true);
    expect(mature(stockedBody('angelfish', 80, 25).deb, debParams('angelfish'))).toBe(false);
  });

  it('draws its survival threshold under the survival it arrives with, so the shop’s dead are never sold', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const fish = stockFish({ species: 'guppy', size: MAX_STOCKED_SIZE, temperature: 25, rng });
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
});

describe('a hatched fish', () => {
  it('is its species’ hatchling, aged 0 with its whole cohort alive and an empty gut', () => {
    const fry = hatchFish({ species: 'corydoras', rng: createRng(2) });
    expect(fry.deb).toEqual(hatchling(debParams('corydoras')));
    expect([fry.age, fry.survival, fry.gut]).toEqual([0, 1, 0]);
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
      const f = hatchFish({ species: 'neon_tetra', rng });
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

    const fish = hatchFish({ species: 'neon_tetra', rng });

    expect(fish.sex).toBe(sexDraw < 0.5 ? 'male' : 'female');
    expect(fish.hardinessOffset).toBeCloseTo((hardinessDraw - 0.5) * 2 * HARDINESS_OFFSET_SPAN * hardiness, 12);
    expect(fish.health).toBeCloseTo(100 + (healthDraw - 0.5) * 2 * HEALTH_JITTER, 12);
    expect(fish.survivalDraw).toBe(survivalDraw);
  });

  it('names every fish off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(hatchFish({ species: 'guppy', rng }).id);
    expect(ids.size).toBe(1000);
  });

  it('builds the same fish from the same seed — another seed rerolls all but the id', () => {
    const build = (seed: number): ReturnType<typeof stockFish> => stock({ rng: createRng(seed) });
    expect(build(11)).toEqual(build(11));
    expect(build(11)).not.toEqual(build(12));
    expect(build(11).id).toBe(build(12).id);
  });
});
