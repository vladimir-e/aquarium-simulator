import { describe, it, expect } from 'vitest';
import { getFilterSurface, getFilterFlow, isFilterAirDriven, FILTER_SURFACE, FILTER_SPECS, FILTER_AIR_DRIVEN } from './filter.js';

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
  describe('scales flow with tank capacity', () => {
    it('sponge filter achieves 4x turnover on small tanks', () => {
      // 40L tank: 40 * 4 = 160 L/h
      expect(getFilterFlow('sponge', 40)).toBe(160);
    });

    it('HOB filter achieves 6x turnover on medium tanks', () => {
      // 100L tank: 100 * 6 = 600 L/h
      expect(getFilterFlow('hob', 100)).toBe(600);
    });

    it('canister filter achieves 8x turnover', () => {
      // 200L tank: 200 * 8 = 1600 L/h
      expect(getFilterFlow('canister', 200)).toBe(1600);
    });

    it('sump filter achieves 10x turnover', () => {
      // 400L tank: 400 * 10 = 4000 L/h
      expect(getFilterFlow('sump', 400)).toBe(4000);
    });
  });

  describe('caps flow at max for undersized filters', () => {
    it('sponge filter caps at 300 L/h for large tanks', () => {
      // 200L tank would need 800 L/h but sponge caps at 300
      expect(getFilterFlow('sponge', 200)).toBe(300);
    });

    it('HOB filter caps at 1250 L/h for large tanks', () => {
      // 300L tank would need 1800 L/h but HOB caps at 1250
      expect(getFilterFlow('hob', 300)).toBe(1250);
    });

    it('canister filter caps at 4500 L/h for very large tanks', () => {
      // 600L tank would need 4800 L/h but canister caps at 4500
      expect(getFilterFlow('canister', 600)).toBe(4500);
    });

    it('sump filter has no practical cap', () => {
      // 1000L tank: 1000 * 10 = 10000 L/h (no cap for sump)
      expect(getFilterFlow('sump', 1000)).toBe(10000);
    });
  });

  describe('uses correct spec values', () => {
    it('sponge has 4x turnover and 75L max capacity', () => {
      expect(FILTER_SPECS.sponge.targetTurnover).toBe(4);
      expect(FILTER_SPECS.sponge.maxCapacityLiters).toBe(75);
      expect(FILTER_SPECS.sponge.maxFlowLph).toBe(300);
    });

    it('HOB has 6x turnover and 208L max capacity', () => {
      expect(FILTER_SPECS.hob.targetTurnover).toBe(6);
      expect(FILTER_SPECS.hob.maxCapacityLiters).toBe(208);
      expect(FILTER_SPECS.hob.maxFlowLph).toBe(1250);
    });

    it('canister has 8x turnover and 568L max capacity', () => {
      expect(FILTER_SPECS.canister.targetTurnover).toBe(8);
      expect(FILTER_SPECS.canister.maxCapacityLiters).toBe(568);
      expect(FILTER_SPECS.canister.maxFlowLph).toBe(4500);
    });

    it('sump has 10x turnover and unlimited capacity', () => {
      expect(FILTER_SPECS.sump.targetTurnover).toBe(10);
      expect(FILTER_SPECS.sump.maxCapacityLiters).toBe(Infinity);
      expect(FILTER_SPECS.sump.maxFlowLph).toBe(Infinity);
    });
  });
});

describe('isFilterAirDriven', () => {
  it('returns true for sponge filter', () => {
    expect(isFilterAirDriven('sponge')).toBe(true);
  });

  it('returns false for HOB filter', () => {
    expect(isFilterAirDriven('hob')).toBe(false);
  });

  it('returns false for canister filter', () => {
    expect(isFilterAirDriven('canister')).toBe(false);
  });

  it('returns false for sump filter', () => {
    expect(isFilterAirDriven('sump')).toBe(false);
  });

  it('matches FILTER_AIR_DRIVEN constants', () => {
    expect(isFilterAirDriven('sponge')).toBe(FILTER_AIR_DRIVEN.sponge);
    expect(isFilterAirDriven('hob')).toBe(FILTER_AIR_DRIVEN.hob);
    expect(isFilterAirDriven('canister')).toBe(FILTER_AIR_DRIVEN.canister);
    expect(isFilterAirDriven('sump')).toBe(FILTER_AIR_DRIVEN.sump);
  });
});
