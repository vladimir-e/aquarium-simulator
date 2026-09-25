import { describe, it, expect } from 'vitest';
import { ANOXIA, eFoldsUnder, HARDY_TOLERANCE, toleranceFactor } from './tolerance.js';

describe('eFoldsUnder', () => {
  it('is zero at or above the edge and the log of the ratio under it', () => {
    expect(eFoldsUnder(5, 4)).toBe(0);
    expect(eFoldsUnder(4, 4)).toBe(0);
    expect(eFoldsUnder(4 / Math.E, 4)).toBeCloseTo(1, 12);
  });

  it('reads anything under anoxia as anoxia', () => {
    expect(eFoldsUnder(0, 4)).toBe(eFoldsUnder(ANOXIA, 4));
  });
});

describe('toleranceFactor', () => {
  it('runs from the edge itself at hardiness 0 to the hardy span at 1', () => {
    expect(toleranceFactor(0)).toBe(1);
    expect(toleranceFactor(1)).toBe(HARDY_TOLERANCE);
    expect(toleranceFactor(0.8)).toBeGreaterThan(toleranceFactor(0.5));
  });
});
