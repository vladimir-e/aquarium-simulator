import { describe, it, expect } from 'vitest';
import { lightSaturationFactor, monodFactor, monodUptake, q10Factor } from './kinetics.js';

describe('q10Factor', () => {
  it('leaves a rate alone at the temperature it is quoted at', () => {
    expect(q10Factor(25, 2, 25)).toBe(1);
  });

  it('multiplies by the coefficient per ten degrees, either way', () => {
    expect(q10Factor(35, 2, 25)).toBeCloseTo(2, 12);
    expect(q10Factor(15, 2, 25)).toBeCloseTo(0.5, 12);
    expect(q10Factor(45, 3, 25)).toBeCloseTo(9, 12);
  });
});

describe('monodFactor', () => {
  it('runs at half rate at the half-saturation constant', () => {
    for (const k of [0.2, 0.5, 1, 1.1]) {
      expect(monodFactor(k, k)).toBeCloseTo(0.5, 12);
    }
  });

  it('gives nothing at all with no substrate, and never less', () => {
    expect(monodFactor(0, 0.5)).toBe(0);
    expect(monodFactor(-1, 0.5)).toBe(0);
    expect(monodFactor(0, 0)).toBe(0);
  });

  it('stays inside zero and one, and climbs with the substrate', () => {
    let previous = 0;
    for (const concentration of [0.01, 0.1, 0.5, 1, 4, 8, 100, 1e6]) {
      const factor = monodFactor(concentration, 0.5);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeLessThan(1);
      previous = factor;
    }
  });

  it('approaches the full rate as the substrate outruns the constant', () => {
    expect(monodFactor(1e9, 0.5)).toBeCloseTo(1, 8);
  });

  it('holds a rate back harder the fussier the process is about its substrate', () => {
    expect(monodFactor(2, 1.1)).toBeLessThan(monodFactor(2, 0.3));
  });

  it('never limits anything at a half-saturation of nothing', () => {
    expect(monodFactor(0.001, 0)).toBe(1);
  });
});

describe('monodUptake', () => {
  it('draws the curve at the stock it leaves behind', () => {
    for (const [stock, capacity, k] of [
      [1, 0.2, 0.5],
      [10, 3, 0.5],
      [0.01, 50, 2],
    ]) {
      const uptake = monodUptake(stock, capacity, k);
      expect(uptake).toBeCloseTo(capacity * monodFactor(stock - uptake, k), 12);
    }
  });

  it('never overdraws the stock or the capacity', () => {
    for (const capacity of [0.01, 1, 100, 1e6]) {
      const uptake = monodUptake(1, capacity, 0.5);
      expect(uptake).toBeLessThan(1);
      expect(uptake).toBeLessThan(capacity);
    }
  });

  it('is the lesser of stock and capacity once the half-saturation is gone', () => {
    expect(monodUptake(3, 1, 0)).toBeCloseTo(1, 12);
    expect(monodUptake(1, 3, 0)).toBeCloseTo(1, 12);
  });

  it('draws nothing from an empty stock or with no capacity', () => {
    expect(monodUptake(0, 1, 0.5)).toBe(0);
    expect(monodUptake(1, 0, 0.5)).toBe(0);
  });
});

describe('lightSaturationFactor', () => {
  const IK = 20;

  it('gives nothing in the dark, and never less', () => {
    expect(lightSaturationFactor(0, IK)).toBe(0);
    expect(lightSaturationFactor(-30, IK)).toBe(0);
  });

  it('runs at 76 % of full rate at the irradiance it saturates at', () => {
    for (const ik of [8, 20, 60, 150]) {
      expect(lightSaturationFactor(ik, ik)).toBeCloseTo(0.7616, 4);
    }
  });

  it('has all but finished by twice that, and is inside a percent by three times', () => {
    expect(lightSaturationFactor(2 * IK, IK)).toBeCloseTo(0.964, 3);
    expect(lightSaturationFactor(3 * IK, IK)).toBeCloseTo(0.995, 3);
  });

  it('stays inside zero and one, and climbs with the light', () => {
    let previous = 0;
    for (const par of [0.5, 2, 8, 20, 45, 90, 200, 1e4]) {
      const factor = lightSaturationFactor(par, IK);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeLessThanOrEqual(1);
      previous = factor;
    }
  });

  it('flattens, so the same extra light buys less the brighter it already is', () => {
    const gain = (from: number): number =>
      lightSaturationFactor(from + IK, IK) - lightSaturationFactor(from, IK);

    expect(gain(0)).toBeGreaterThan(gain(IK));
    expect(gain(IK)).toBeGreaterThan(gain(2 * IK));
  });

  it('answers more light for longer the higher a species saturates', () => {
    expect(lightSaturationFactor(60, 60)).toBeLessThan(lightSaturationFactor(60, 16));
  });

  it('never limits anything at a saturating irradiance of nothing', () => {
    expect(lightSaturationFactor(0.001, 0)).toBe(1);
    expect(lightSaturationFactor(200, -5)).toBe(1);
  });
});
