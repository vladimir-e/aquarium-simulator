import { describe, it, expect } from 'vitest';
import {
  calculateEvaporation,
  evaporationSystem,
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
} from './evaporation.js';
import { createSimulation } from '../state.js';

describe('calculateEvaporation', () => {
  it('reduces water level over time', () => {
    const evap = calculateEvaporation(100, 25, 22);

    expect(evap).toBeGreaterThan(0);
  });

  it('evaporation rate increases with temperature above room temp', () => {
    const lowTemp = calculateEvaporation(100, 24, 22);
    const highTemp = calculateEvaporation(100, 30, 22);

    expect(highTemp).toBeGreaterThan(lowTemp);
  });

  it('evaporation rate increases with temperature below room temp', () => {
    // Even when water is cooler, evaporation happens based on abs temp diff
    const smallDiff = calculateEvaporation(100, 21, 22);
    const largeDiff = calculateEvaporation(100, 17, 22);

    expect(largeDiff).toBeGreaterThan(smallDiff);
  });

  it('evaporation rate scales with water level', () => {
    const lowLevel = calculateEvaporation(50, 25, 22);
    const highLevel = calculateEvaporation(100, 25, 22);

    expect(highLevel).toBeGreaterThan(lowLevel);
  });

  it('returns zero when water level is zero', () => {
    const evap = calculateEvaporation(0, 25, 22);

    expect(evap).toBe(0);
  });

  it('returns zero when water level is negative', () => {
    const evap = calculateEvaporation(-10, 25, 22);

    expect(evap).toBe(0);
  });

  it('calculates approximately 1% per day at equilibrium', () => {
    // At equilibrium (water temp = room temp), rate should be ~1% per day
    const waterLevel = 100;
    const evapPerHour = calculateEvaporation(waterLevel, 22, 22);
    const evapPerDay = evapPerHour * 24;

    // Should be close to 1% (0.01 * waterLevel = 1 liter)
    expect(evapPerDay).toBeCloseTo(waterLevel * BASE_RATE_PER_DAY, 4);
  });

  it('doubles evaporation rate per TEMP_DOUBLING_INTERVAL degrees', () => {
    const baseEvap = calculateEvaporation(100, 22, 22);
    const doubledEvap = calculateEvaporation(100, 22 + TEMP_DOUBLING_INTERVAL, 22);

    expect(doubledEvap).toBeCloseTo(baseEvap * 2, 4);
  });

  it('quadruples evaporation at 2x doubling interval', () => {
    const baseEvap = calculateEvaporation(100, 22, 22);
    const quadrupledEvap = calculateEvaporation(
      100,
      22 + 2 * TEMP_DOUBLING_INTERVAL,
      22
    );

    expect(quadrupledEvap).toBeCloseTo(baseEvap * 4, 4);
  });
});

describe('evaporationSystem', () => {
  it('has correct id and tier', () => {
    expect(evaporationSystem.id).toBe('evaporation');
    expect(evaporationSystem.tier).toBe('passive');
  });

  it('returns waterLevel effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
    });

    const effects = evaporationSystem.update(state);

    expect(effects).toHaveLength(1);
    expect(effects[0].tier).toBe('passive');
    expect(effects[0].resource).toBe('waterLevel');
    expect(effects[0].delta).toBeLessThan(0); // Evaporation decreases water
    expect(effects[0].source).toBe('evaporation');
  });

  it('returns empty array when water level is zero', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
    });
    // Manually set water level to 0
    const emptyState = {
      ...state,
      tank: { ...state.tank, waterLevel: 0 },
    };

    const effects = evaporationSystem.update(emptyState);

    expect(effects).toHaveLength(0);
  });

  it('evaporation is higher with larger temperature difference', () => {
    const state1 = createSimulation({
      tankCapacity: 100,
      initialTemperature: 24,
      roomTemperature: 22,
    });
    const state2 = createSimulation({
      tankCapacity: 100,
      initialTemperature: 30,
      roomTemperature: 22,
    });

    const effects1 = evaporationSystem.update(state1);
    const effects2 = evaporationSystem.update(state2);

    expect(Math.abs(effects2[0].delta)).toBeGreaterThan(
      Math.abs(effects1[0].delta)
    );
  });
});
