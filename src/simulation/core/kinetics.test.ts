import { describe, it, expect } from 'vitest';
import { monodFactor, q10Factor } from './kinetics.js';

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

  // A process with no affinity term is one nothing limits, which is what the
  // engine's rates meant before there was a factor at all.
  it('never limits anything at a half-saturation of nothing', () => {
    expect(monodFactor(0.001, 0)).toBe(1);
  });
});
