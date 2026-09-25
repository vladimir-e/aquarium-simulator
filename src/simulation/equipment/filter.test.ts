import { describe, it, expect } from 'vitest';
import { getFilterFlow, isFilterAirDriven, FILTER_SPECS, type FilterType } from './filter.js';

const TYPES = Object.keys(FILTER_SPECS) as FilterType[];

describe('getFilterFlow', () => {
  it('turns the tank over at the filter’s target rate until it hits its ceiling', () => {
    for (const type of TYPES) {
      const { targetTurnover, maxFlowLph } = FILTER_SPECS[type];
      for (const capacity of [20, 100, 400, 2000]) {
        expect(getFilterFlow(type, capacity)).toBe(Math.min(capacity * targetTurnover, maxFlowLph));
      }
    }
  });

  it('doubles with the tank while under its ceiling', () => {
    for (const type of TYPES) {
      expect(getFilterFlow(type, 20)).toBe(2 * getFilterFlow(type, 10));
    }
  });
});

describe('isFilterAirDriven', () => {
  it('is true only for the sponge', () => {
    expect(TYPES.filter(isFilterAirDriven)).toEqual(['sponge']);
  });
});
