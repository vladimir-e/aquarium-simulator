import { describe, it, expect } from 'vitest';
import { getFilterSurface, getFilterFlow, FILTER_SURFACE, FILTER_FLOW } from './filter.js';

describe('getFilterSurface', () => {
  it('returns correct surface for sponge filter', () => {
    expect(getFilterSurface('sponge')).toBe(8000);
  });

  it('returns correct surface for HOB filter', () => {
    expect(getFilterSurface('hob')).toBe(15000);
  });

  it('returns correct surface for canister filter', () => {
    expect(getFilterSurface('canister')).toBe(25000);
  });

  it('returns correct surface for sump filter', () => {
    expect(getFilterSurface('sump')).toBe(40000);
  });

  it('matches FILTER_SURFACE constants', () => {
    expect(getFilterSurface('sponge')).toBe(FILTER_SURFACE.sponge);
    expect(getFilterSurface('hob')).toBe(FILTER_SURFACE.hob);
    expect(getFilterSurface('canister')).toBe(FILTER_SURFACE.canister);
    expect(getFilterSurface('sump')).toBe(FILTER_SURFACE.sump);
  });
});

describe('getFilterFlow', () => {
  it('returns correct flow for sponge filter (lowest)', () => {
    expect(getFilterFlow('sponge')).toBe(100);
  });

  it('returns correct flow for HOB filter', () => {
    expect(getFilterFlow('hob')).toBe(300);
  });

  it('returns correct flow for canister filter', () => {
    expect(getFilterFlow('canister')).toBe(600);
  });

  it('returns correct flow for sump filter (highest)', () => {
    expect(getFilterFlow('sump')).toBe(1000);
  });

  it('matches FILTER_FLOW constants', () => {
    expect(getFilterFlow('sponge')).toBe(FILTER_FLOW.sponge);
    expect(getFilterFlow('hob')).toBe(FILTER_FLOW.hob);
    expect(getFilterFlow('canister')).toBe(FILTER_FLOW.canister);
    expect(getFilterFlow('sump')).toBe(FILTER_FLOW.sump);
  });
});
