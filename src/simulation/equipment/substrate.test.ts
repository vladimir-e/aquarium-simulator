import { describe, it, expect } from 'vitest';
import { getSubstrateSurface, SUBSTRATE_SURFACE_PER_LITER } from './substrate.js';

describe('getSubstrateSurface', () => {
  it('returns 0 for no substrate', () => {
    expect(getSubstrateSurface('none', 100)).toBe(0);
  });

  it('returns correct surface for sand (400 cm²/L)', () => {
    expect(getSubstrateSurface('sand', 100)).toBe(40000);
  });

  it('returns correct surface for gravel (800 cm²/L)', () => {
    expect(getSubstrateSurface('gravel', 100)).toBe(80000);
  });

  it('returns correct surface for aqua soil (1200 cm²/L, highest)', () => {
    expect(getSubstrateSurface('aqua_soil', 100)).toBe(120000);
  });

  it('scales surface with tank capacity', () => {
    expect(getSubstrateSurface('gravel', 50)).toBe(40000);
    expect(getSubstrateSurface('gravel', 200)).toBe(160000);
  });

  it('matches SUBSTRATE_SURFACE_PER_LITER constants', () => {
    expect(getSubstrateSurface('none', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.none * 100);
    expect(getSubstrateSurface('sand', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.sand * 100);
    expect(getSubstrateSurface('gravel', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.gravel * 100);
    expect(getSubstrateSurface('aqua_soil', 100)).toBe(SUBSTRATE_SURFACE_PER_LITER.aqua_soil * 100);
  });
});
