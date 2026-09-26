import { describe, it, expect } from 'vitest';
import { HARDY_TOLERANCE, toleranceFactor } from './tolerance.js';

describe('toleranceFactor', () => {
  it('runs from the edge itself at hardiness 0 to the hardy span at 1', () => {
    expect(toleranceFactor(0)).toBe(1);
    expect(toleranceFactor(1)).toBe(HARDY_TOLERANCE);
    expect(toleranceFactor(0.8)).toBeGreaterThan(toleranceFactor(0.5));
  });
});
