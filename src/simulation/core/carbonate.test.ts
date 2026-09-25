import { describe, it, expect } from 'vitest';
import { carbonateKh, carbonatePh, getPh } from './carbonate.js';
import { getKhMass } from '../resources/helpers.js';

describe('carbonatePh', () => {
  it('falls as CO₂ rises', () => {
    expect(carbonatePh(30, 4)).toBeLessThan(carbonatePh(10, 4));
    expect(carbonatePh(10, 4)).toBeLessThan(carbonatePh(3, 4));
  });

  it('rises with KH', () => {
    expect(carbonatePh(10, 8)).toBeGreaterThan(carbonatePh(10, 4));
    expect(carbonatePh(10, 4)).toBeGreaterThan(carbonatePh(10, 1));
  });

  it('moves one unit per decade of the CO₂-to-KH ratio, away from the floors', () => {
    expect(carbonatePh(3, 10) - carbonatePh(30, 10)).toBeCloseTo(1, 1);
    expect(carbonatePh(20, 10) - carbonatePh(20, 1)).toBeCloseTo(1, 1);
  });

  it('reads the hobby chart: 3 × KH ppm of CO₂ is neutral', () => {
    expect(carbonatePh(3 * 5, 5)).toBeCloseTo(7, 1);
  });

  it('stays finite and continuous at the edges', () => {
    for (const [co2, dkh] of [[0, 0], [4, 0], [0, 4], [100, 0]]) {
      expect(Number.isFinite(carbonatePh(co2, dkh))).toBe(true);
    }
    expect(carbonatePh(4, 0.001) - carbonatePh(4, 0)).toBeLessThan(0.01);
  });

  it('crashes soft water toward acid, not past it', () => {
    const soft = carbonatePh(4, 0);
    expect(soft).toBeGreaterThan(5.5);
    expect(soft).toBeLessThan(6.2);
  });
});

describe('carbonateKh', () => {
  it('is the inverse of carbonatePh wherever the pH is reachable', () => {
    for (const [co2, ph] of [[4, 7.5], [25, 6.5], [10, 7]]) {
      expect(carbonatePh(co2, carbonateKh(co2, ph))).toBeCloseTo(ph, 10);
    }
  });

  it('answers zero for a pH no KH is low enough to reach', () => {
    expect(carbonateKh(4, 4)).toBe(0);
  });
});

describe('getPh', () => {
  it('reads KH as a concentration, so the same mass in less water raises pH', () => {
    const kh = getKhMass(3, 100);
    expect(getPh({ co2: 10, kh, water: 50 })).toBeGreaterThan(getPh({ co2: 10, kh, water: 100 }));
  });

  it('survives an empty tank', () => {
    expect(Number.isFinite(getPh({ co2: 10, kh: 500, water: 0 }))).toBe(true);
  });
});
