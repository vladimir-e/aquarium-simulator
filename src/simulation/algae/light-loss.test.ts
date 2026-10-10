import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { bloomPass, lightLoss, waterExtinction } from './light-loss.js';
import { opticsDefaults } from '../config/optics.js';
import { createSimulation, type SimulationState } from '../state.js';
import { bloomAt } from '../tests/blooms.js';

const blooms = (greenWater: number, film: number): SimulationState =>
  produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.algae.greenWater = bloomAt(draft, 'greenWater', greenWater);
    draft.algae.film = bloomAt(draft, 'film', film);
  });

describe('lightLoss', () => {
  it('is the water alone in a clean tank', () => {
    const clean = lightLoss(blooms(0, 0), opticsDefaults);
    expect(clean.extinction).toBe(opticsDefaults.waterAttenuationPerCm);
    expect(clean.leafPass).toBe(1);
  });

  it('adds green water to the water’s extinction by its coverage, and coats nothing', () => {
    const loss = lightLoss(blooms(60, 0), opticsDefaults);
    expect(loss.extinction).toBeCloseTo(opticsDefaults.waterAttenuationPerCm + 0.6 * opticsDefaults.algaeAttenuationPerCm, 14);
    expect(loss.blooms.greenWater.coat).toBe(0);
    expect(loss.leafPass).toBe(1);
  });

  it('coats a surface with film at its coverage, each coated share passing e^(−D), and clouds no water', () => {
    const loss = lightLoss(blooms(0, 40), opticsDefaults);
    const opacity = 1 - Math.exp(-opticsDefaults.algaeCoatOpticalDepth);
    expect(loss.blooms.film.coat).toBeCloseTo(0.4 * opacity, 14);
    expect(loss.leafPass).toBeCloseTo(1 - 0.4 * opacity, 14);
    expect(loss.extinction).toBe(opticsDefaults.waterAttenuationPerCm);
  });

  it('grows linearly in green water, and shades nothing at zero attenuation', () => {
    const k = (mass: number): number => waterExtinction(blooms(mass, 0), opticsDefaults) - opticsDefaults.waterAttenuationPerCm;
    expect(k(80)).toBeCloseTo(2 * k(40), 14);
    const clear = { ...opticsDefaults, algaeAttenuationPerCm: 0, algaeCoatOpticalDepth: 0 };
    expect(lightLoss(blooms(100, 100), clear)).toMatchObject({ extinction: clear.waterAttenuationPerCm, leafPass: 1 });
  });
});

describe('bloomPass', () => {
  it('is Beer–Lambert down the depth for green water, and the coat alone for film', () => {
    const { blooms: loss } = lightLoss(blooms(50, 50), opticsDefaults);
    expect(bloomPass(loss.greenWater, 20) * bloomPass(loss.greenWater, 10)).toBeCloseTo(bloomPass(loss.greenWater, 30), 14);
    expect(bloomPass(loss.greenWater, 0)).toBe(1);
    expect(bloomPass(loss.film, 0)).toBe(bloomPass(loss.film, 40));
    expect(bloomPass(loss.film, 0)).toBeCloseTo(1 - loss.film.coat, 14);
  });
});
