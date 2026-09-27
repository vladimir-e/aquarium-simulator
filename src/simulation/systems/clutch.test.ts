import { describe, it, expect } from 'vitest';
import { createSimulation, type Clutch, type Resources } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { getMassFromPpm } from '../resources/index.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import { developmentRate, eggHarmRate, eggPredationRate, settleClutch } from './clutch.js';
import { metabolicFactorOf } from './metabolism.js';
import { speciesHardiness, waterStressors } from './fish-health.js';

const config = DEFAULT_CONFIG.livestock;
const clean = createSimulation({ tankCapacity: 100 }).resources;
const volume = clean.water;

const withNitrite = (ppm: number): Resources => ({ ...clean, nitrite: getMassFromPpm(ppm, volume) });
const laid = { species: 'neon_tetra' } as const;
const neon = speciesHardiness('neon_tetra');

describe('eggHarmRate', () => {
  it('is nothing in clean water', () => {
    expect(eggHarmRate(laid, neon, clean, volume, config)).toBe(0);
  });

  it('is the fish water channel at the species hardiness, eggSensitivity times as hard, as a share an hour', () => {
    const water = withNitrite(8);
    const damage = waterStressors('neon_tetra', speciesHardiness('neon_tetra'), water, volume, config).reduce(
      (sum, f) => sum + f.amount,
      0
    );
    expect(damage).toBeGreaterThan(0);
    expect(eggHarmRate(laid, neon, water, volume, config)).toBeCloseTo((config.eggSensitivity * damage) / 100, 12);
  });

  it('harms a brood its mother carries as hard as her, at her hardiness', () => {
    const water = withNitrite(8);
    const damage = waterStressors('guppy', speciesHardiness('guppy'), water, volume, config).reduce(
      (sum, f) => sum + f.amount,
      0
    );
    expect(eggHarmRate({ species: 'guppy', motherId: 'mother' }, speciesHardiness('guppy'), water, volume, config)).toBeCloseTo(
      damage / 100,
      12
    );
  });

  it('costs the same for every doubling of a toxin past the edge', () => {
    const [a, b, c] = [4, 8, 16].map((ppm) => eggHarmRate(laid, neon, withNitrite(ppm), volume, config));
    expect(b - a).toBeGreaterThan(0);
    expect(c - b).toBeCloseTo(b - a, 10);
  });

  it('rises out of a species temperature band', () => {
    const cold = { ...clean, temperature: FISH_SPECIES_DATA.neon_tetra.temperatureRange[0] - 3 };
    expect(eggHarmRate(laid, neon, cold, volume, config)).toBeGreaterThan(0);
  });
});

describe('eggPredationRate', () => {
  it('scales with the mass of fish per litre', () => {
    const one = eggPredationRate(laid, 1, volume, config);
    expect(one).toBeGreaterThan(0);
    expect(eggPredationRate(laid, 3, volume, config)).toBeCloseTo(3 * one, 12);
    expect(eggPredationRate(laid, 1, 2 * volume, config)).toBeCloseTo(one / 2, 12);
  });

  it('reaches a clutch in proportion to its exposure, and never a carried one', () => {
    const open = eggPredationRate(laid, 5, volume, config);
    expect(eggPredationRate({ species: 'betta' }, 5, volume, config)).toBeCloseTo(
      open * FISH_SPECIES_DATA.betta.breeding.clutchExposure,
      12
    );
    expect(eggPredationRate({ species: 'guppy', motherId: 'mother' }, 5, volume, config)).toBe(0);
  });

  it('is nothing without fish or water', () => {
    expect(eggPredationRate(laid, 0, volume, config)).toBe(0);
    expect(eggPredationRate(laid, 5, 0, config)).toBe(0);
  });
});

describe('developmentRate', () => {
  const at = (temperature: number, oxygen = clean.oxygen): number =>
    developmentRate('corydoras', metabolicFactorOf({ temperature, oxygen }, config));

  it('doubles every ten degrees on the metabolic Q10', () => {
    expect(at(28) / at(18)).toBeCloseTo(config.metabolicQ10, 10);
    expect(at(26)).toBeGreaterThan(at(22));
  });

  it('slows short of oxygen', () => {
    expect(at(25, 1)).toBeLessThan(at(25, 8));
  });

  it('completes in the species development time at the reference in unlimited oxygen', () => {
    for (const species of Object.keys(FISH_SPECIES_DATA) as (keyof typeof FISH_SPECIES_DATA)[]) {
      expect(developmentRate(species, 1) * FISH_SPECIES_DATA[species].breeding.developmentTime).toBeCloseTo(1, 12);
    }
  });
});

describe('settleClutch', () => {
  const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 50, development: 0.2 };

  it('thins the count first order, and a bad hour never empties it', () => {
    const { clutch: after } = settleClutch(clutch, 5, 5, 0);
    expect(after.eggs).toBeGreaterThan(0);
    expect(after.eggs).toBeCloseTo(50 * Math.exp(-10), 12);
  });

  it('splits the dead between the two rates in proportion, losing none', () => {
    const hour = settleClutch(clutch, 0.1, 0.3, 0);
    expect(hour.eaten / hour.spoiled).toBeCloseTo(3, 10);
    expect(hour.clutch.eggs + hour.eaten + hour.spoiled).toBeCloseTo(clutch.eggs, 12);
  });

  it('keeps every egg at no harm and no predators, and develops', () => {
    const hour = settleClutch(clutch, 0, 0, 0.05);
    expect(hour.clutch.eggs).toBe(50);
    expect(hour.eaten).toBe(0);
    expect(hour.spoiled).toBe(0);
    expect(hour.clutch.development).toBeCloseTo(0.25, 12);
  });

  it('never goes negative or off the number line, at any rate', () => {
    for (const rate of [0, 1e-9, 1, 1e3, 1e9]) {
      const hour = settleClutch(clutch, rate, rate, 0);
      expect(hour.clutch.eggs).toBeGreaterThanOrEqual(0);
      for (const n of [hour.clutch.eggs, hour.eaten, hour.spoiled]) expect(Number.isNaN(n)).toBe(false);
    }
  });
});
