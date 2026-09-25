import { describe, it, expect } from 'vitest';
import { getHourOfDay, getDayNumber } from './clock.js';
import { createSimulation } from '../state.js';

describe('getHourOfDay / getDayNumber', () => {
  it.each([
    [0, 0, 0],
    [12, 12, 0],
    [23, 23, 0],
    [24, 0, 1],
    [50, 2, 2],
  ])('reads tick %d as hour %d of day %d', (at, hour, day) => {
    const state = { ...createSimulation({ tankCapacity: 100 }), tick: at };

    expect(getHourOfDay(state)).toBe(hour);
    expect(getDayNumber(state)).toBe(day);
  });
});
