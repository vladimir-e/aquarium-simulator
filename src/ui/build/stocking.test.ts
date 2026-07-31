import { describe, it, expect } from 'vitest';
import type { Fish, FishSpecies } from '../../simulation/index.js';
import { FISH_SPECIES_DATA, getMaxFishMass } from '../../simulation/index.js';
import { bioload, bioloadNote, fishOptions, GUIDELINE_G_PER_L, projectedAdultMass } from './stocking';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function stock(species: FishSpecies, n: number): Fish[] {
  return Array.from({ length: n }, (_, i) => makeFish({ id: `${species}-${i}`, species }));
}

describe('projectedAdultMass', () => {
  it('sums species adult mass, counting fry at adult mass', () => {
    const fish = [
      makeFish({ id: 'a', species: 'corydoras' }), // 4 g adult
      makeFish({ id: 'f', species: 'corydoras', stage: 'fry', age: 24, mass: 0.2 }), // still 4 g projected
    ];
    expect(projectedAdultMass(fish)).toBe(8);
  });
});

describe('bioload', () => {
  it('lands the reference 40-gal community at ~0.8x (the calibration anchor)', () => {
    // 12 neon (6 g) + 8 corydoras (32 g) + 4 guppy (4 g) + 2 angelfish (30 g) = 72 g in 150 L.
    const community = [
      ...stock('neon_tetra', 12),
      ...stock('corydoras', 8),
      ...stock('guppy', 4),
      ...stock('angelfish', 2),
    ];
    const load = bioload(community, 150);
    expect(load.massG).toBe(72);
    expect(load.guidelineG).toBeCloseTo(90, 5);
    expect(load.ratio).toBeCloseTo(0.8, 2);
    expect(load.status).toBe('warn');
  });

  it('reads calm for a lightly-stocked tank', () => {
    const load = bioload(stock('neon_tetra', 12), 150); // 6 g / 90 g
    expect(load.ratio).toBeLessThan(0.7);
    expect(load.status).toBe('ok');
  });

  it('alerts and clamps once projected mass passes the guideline', () => {
    const load = bioload(stock('corydoras', 40), 150); // 160 g / 90 g = 1.78x
    expect(load.ratio).toBeGreaterThan(1);
    expect(load.status).toBe('alert');
    expect(load.pct).toBe(100);
  });

  it('handles empty and zero-capacity tanks', () => {
    expect(bioload([], 150)).toMatchObject({ massG: 0, ratio: 0, status: 'ok' });
    expect(bioload(stock('neon_tetra', 1), 0)).toMatchObject({ guidelineG: 0, ratio: 0 });
  });

  it('uses the documented guideline density', () => {
    expect(GUIDELINE_G_PER_L).toBe(0.6);
  });
});

describe('bioloadNote', () => {
  // 0.6 g/L over a 200 L tank is a 120 g guideline; 4 corydoras project 16 g.
  const load = bioload(stock('corydoras', 4), 200);

  it('spells out the mass against the guideline that produced the × figure', () => {
    expect(bioloadNote(load, 'metric')).toBe(
      '16.0 g projected adult mass · guideline 120 g at 0.6 g/L'
    );
  });

  it('quotes the density per the reader’s own volume unit', () => {
    // 0.6 g per litre is 2.27 g per gallon — the guideline mass itself is unchanged.
    expect(bioloadNote(load, 'imperial')).toBe(
      '16.0 g projected adult mass · guideline 120 g at 2.3 g/gal'
    );
  });
});

describe('fishOptions', () => {
  it('counts the adults of each species already in the tank', () => {
    const fish = [
      ...stock('neon_tetra', 2),
      makeFish({ id: 'fry', species: 'neon_tetra', stage: 'fry', age: 24, mass: 0.1 }),
      ...stock('guppy', 1),
    ];
    const options = fishOptions(fish, 200, 'metric');
    const byName = Object.fromEntries(options.map((o) => [o.species, o]));

    expect(options.map((o) => o.species)).toEqual([
      'neon_tetra',
      'betta',
      'guppy',
      'angelfish',
      'corydoras',
    ]);
    expect(byName.neon_tetra.count).toBe(2); // the fry is not an adult in the tank
    expect(byName.guppy.count).toBe(1);
    expect(byName.betta.count).toBe(0);
  });

  it('prices one more of each species at its species adult mass', () => {
    const options = fishOptions(stock('neon_tetra', 2), 200, 'metric');
    const neon = options.find((o) => o.species === 'neon_tetra')!;
    const angel = options.find((o) => o.species === 'angelfish')!;

    expect(neon.addsG).toBe(0.5);
    expect(neon.hint).toBe('2 in tank · +0.5 g');
    expect(angel.addsG).toBe(15);
    expect(angel.hint).toBe('0 in tank · +15 g');
  });

  it('blocks only the species past the engine’s physical ceiling, in its words', () => {
    // 0.02 L holds 10 g of fish, so an angelfish (15 g) cannot go in but a cory (4 g) can.
    const liters = 0.02;
    expect(getMaxFishMass(liters)).toBe(10);
    const options = fishOptions([], liters, 'metric');

    const angel = options.find((o) => o.species === 'angelfish')!;
    expect(angel.disabled).toBe(true);
    expect(angel.hint).toBe('Tank at fish capacity (~10g of fish max)');

    const cory = options.find((o) => o.species === 'corydoras')!;
    expect(cory.disabled).toBe(false);
    expect(cory.hint).toBe('0 in tank · +4 g');
  });

  it('states the bands you check a species against before you buy it', () => {
    const neon = FISH_SPECIES_DATA.neon_tetra;
    const [metric] = fishOptions([], 200, 'metric');
    const [imperial] = fishOptions([], 200, 'imperial');

    expect(neon.temperatureRange).toEqual([22, 28]);
    expect(neon.phRange).toEqual([6.0, 7.5]);
    expect(metric.facts).toBe('22–28°C · pH 6.0–7.5 · hardiness 0.5');
    // The same band in the reader's own scale — 22–28 °C is 72–82 °F.
    expect(imperial.facts).toBe('72–82°F · pH 6.0–7.5 · hardiness 0.5');
  });

  it('quotes each species’ own bands rather than one set for all of them', () => {
    const facts = Object.fromEntries(
      fishOptions([], 200, 'metric').map((o) => [o.species, o.facts])
    );
    expect(facts.betta).toBe('24–30°C · pH 6.5–7.5 · hardiness 0.6');
    expect(facts.angelfish).toContain('hardiness 0.4');
    expect(new Set(Object.values(facts)).size).toBe(5);
  });

  it('measures the ceiling against what is already swimming, fry included', () => {
    // 8 g of the 10 g ceiling is spent, so only the two lightest species still fit.
    const fish = [makeFish({ id: 'c', species: 'corydoras', mass: 8 })];
    const open = fishOptions(fish, 0.02, 'metric').filter((o) => !o.disabled);
    expect(open.map((o) => o.species)).toEqual(['neon_tetra', 'guppy']);
  });
});
