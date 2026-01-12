import { describe, it, expect } from 'vitest';
import { createSimulation } from './state.js';

describe('createSimulation', () => {
  it('creates simulation with specified tank capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tank.capacity).toBe(100);
  });

  it('sets water level to tank capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tank.waterLevel).toBe(100);
  });

  it('defaults temperature to 25°C', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.resources.temperature).toBe(25);
  });

  it('allows custom initial temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
    });

    expect(state.resources.temperature).toBe(28);
  });

  it('starts at tick 0', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tick).toBe(0);
  });

  it('creates simulation with custom temperature', () => {
    const state = createSimulation({
      tankCapacity: 200,
      initialTemperature: 22,
    });

    expect(state.tick).toBe(0);
    expect(state.tank.capacity).toBe(200);
    expect(state.tank.waterLevel).toBe(200);
    expect(state.resources.temperature).toBe(22);
  });
});
