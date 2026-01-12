import { describe, it, expect, beforeEach } from 'vitest';
import { tick, getHourOfDay, getDayNumber } from './tick.js';
import { createSimulation, type SimulationState } from './state.js';

describe('tick', () => {
  let initialState: SimulationState;

  beforeEach(() => {
    initialState = createSimulation({
      tankCapacity: 100,
      initialWaterLevel: 100,
      initialTemperature: 25,
    });
  });

  it('increments tick counter by 1', () => {
    const newState = tick(initialState);

    expect(newState.tick).toBe(1);
  });

  it('returns a new state object', () => {
    const newState = tick(initialState);

    expect(newState).not.toBe(initialState);
  });

  it('does not mutate original state', () => {
    tick(initialState);

    expect(initialState.tick).toBe(0);
  });

  it('increments tick correctly over multiple calls', () => {
    let state = initialState;

    for (let i = 0; i < 10; i++) {
      state = tick(state);
    }

    expect(state.tick).toBe(10);
    expect(initialState.tick).toBe(0);
  });

  it('preserves other state properties', () => {
    const newState = tick(initialState);

    expect(newState.tank.capacity).toBe(100);
    expect(newState.tank.waterLevel).toBe(100);
    expect(newState.resources.temperature).toBe(25);
  });
});

describe('getHourOfDay', () => {
  it('returns 0 for tick 0', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(getHourOfDay(state)).toBe(0);
  });

  it('returns correct hour for ticks within first day', () => {
    let state = createSimulation({ tankCapacity: 100 });

    for (let i = 0; i < 12; i++) {
      state = tick(state);
    }

    expect(getHourOfDay(state)).toBe(12);
  });

  it('wraps around after 24 hours', () => {
    let state = createSimulation({ tankCapacity: 100 });

    for (let i = 0; i < 25; i++) {
      state = tick(state);
    }

    expect(getHourOfDay(state)).toBe(1);
  });

  it('returns correct hour for arbitrary tick', () => {
    let state = createSimulation({ tankCapacity: 100 });

    // Simulate 50 hours (2 days + 2 hours)
    for (let i = 0; i < 50; i++) {
      state = tick(state);
    }

    expect(getHourOfDay(state)).toBe(2);
  });
});

describe('getDayNumber', () => {
  it('returns 0 for tick 0', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(getDayNumber(state)).toBe(0);
  });

  it('returns 0 for first 24 ticks', () => {
    let state = createSimulation({ tankCapacity: 100 });

    for (let i = 0; i < 23; i++) {
      state = tick(state);
    }

    expect(getDayNumber(state)).toBe(0);
  });

  it('returns 1 after 24 ticks', () => {
    let state = createSimulation({ tankCapacity: 100 });

    for (let i = 0; i < 24; i++) {
      state = tick(state);
    }

    expect(getDayNumber(state)).toBe(1);
  });

  it('returns correct day for arbitrary tick', () => {
    let state = createSimulation({ tankCapacity: 100 });

    // Simulate 50 hours (2 days + 2 hours)
    for (let i = 0; i < 50; i++) {
      state = tick(state);
    }

    expect(getDayNumber(state)).toBe(2);
  });
});
