import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { bloomPass, lightLoss, waterExtinction } from './shade.js';
import { ALGAE, emptyBlooms } from './index.js';
import { opticsDefaults } from '../config/optics.js';
import type { Blooms } from '../state.js';

const blooms = (greenWater: number, film: number): Blooms =>
  produce(emptyBlooms(), (draft) => {
    draft.greenWater.mass = greenWater;
    draft.film.mass = film;
  });

const κ = opticsDefaults.algaeAttenuationPerGram;

describe('lightLoss', () => {
  it('is the water alone in a clean tank', () => {
    const clean = lightLoss(emptyBlooms(), opticsDefaults);
    expect(clean.extinction).toBe(opticsDefaults.waterAttenuationPerCm);
    expect(clean.leafPass).toBe(1);
  });

  it('adds green water to the water’s extinction by its tissue per cm³, and coats nothing', () => {
    const shade = lightLoss(blooms(60, 0), opticsDefaults);
    const perCm3 = (0.6 * ALGAE.greenWater.tissueDensity) / 1000;
    expect(shade.extinction).toBeCloseTo(opticsDefaults.waterAttenuationPerCm + κ * perCm3, 14);
    expect(shade.blooms.greenWater.coat).toBe(0);
    expect(shade.leafPass).toBe(1);
  });

  it('coats a surface with film at its coverage, each coated share passing e^(−κσ), and clouds no water', () => {
    const shade = lightLoss(blooms(0, 40), opticsDefaults);
    const opacity = 1 - Math.exp(-κ * ALGAE.film.tissueDensity);
    expect(shade.blooms.film.coat).toBeCloseTo(0.4 * opacity, 14);
    expect(shade.leafPass).toBeCloseTo(1 - 0.4 * opacity, 14);
    expect(shade.extinction).toBe(opticsDefaults.waterAttenuationPerCm);
  });

  it('grows linearly in green water, and shades nothing at zero attenuation', () => {
    const k = (mass: number): number => waterExtinction(blooms(mass, 0), opticsDefaults) - opticsDefaults.waterAttenuationPerCm;
    expect(k(80)).toBeCloseTo(2 * k(40), 14);
    const clear = { ...opticsDefaults, algaeAttenuationPerGram: 0 };
    expect(lightLoss(blooms(100, 100), clear)).toMatchObject({ extinction: clear.waterAttenuationPerCm, leafPass: 1 });
  });
});

describe('bloomPass', () => {
  it('is Beer–Lambert down the depth for green water, and the coat alone for film', () => {
    const { blooms: shade } = lightLoss(blooms(50, 50), opticsDefaults);
    expect(bloomPass(shade.greenWater, 20) * bloomPass(shade.greenWater, 10)).toBeCloseTo(bloomPass(shade.greenWater, 30), 14);
    expect(bloomPass(shade.greenWater, 0)).toBe(1);
    expect(bloomPass(shade.film, 0)).toBe(bloomPass(shade.film, 40));
    expect(bloomPass(shade.film, 0)).toBeCloseTo(1 - shade.film.coat, 14);
  });
});
