import { describe, it, expect } from 'vitest';
import {
  calculateEvaporation,
  evaporationSystem,
  BASE_RATE_PER_DAY,
  TEMP_DOUBLING_INTERVAL,
  getLidMultiplier,
  LID_MULTIPLIERS,
} from './evaporation.js';
import { createSimulation, type LidType } from '../state.js';

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

  it('applies no reduction with lid type none', () => {
    const evapWithoutLid = calculateEvaporation(100, 25, 22);
    const evapWithNoneLid = calculateEvaporation(100, 25, 22, 'none');

    expect(evapWithNoneLid).toBe(evapWithoutLid);
  });

  it('applies 75% reduction with lid type mesh', () => {
    const baseEvap = calculateEvaporation(100, 25, 22, 'none');
    const meshEvap = calculateEvaporation(100, 25, 22, 'mesh');

    expect(meshEvap).toBeCloseTo(baseEvap * 0.75, 6);
  });

  it('applies 25% of evaporation with lid type full', () => {
    const baseEvap = calculateEvaporation(100, 25, 22, 'none');
    const fullEvap = calculateEvaporation(100, 25, 22, 'full');

    expect(fullEvap).toBeCloseTo(baseEvap * 0.25, 6);
  });

  it('applies 0% evaporation (no evaporation) with lid type sealed', () => {
    const sealedEvap = calculateEvaporation(100, 25, 22, 'sealed');

    expect(sealedEvap).toBe(0);
  });
});

describe('getLidMultiplier', () => {
  it('returns 1.0 for none', () => {
    expect(getLidMultiplier('none')).toBe(1.0);
  });

  it('returns 0.75 for mesh', () => {
    expect(getLidMultiplier('mesh')).toBe(0.75);
  });

  it('returns 0.25 for full', () => {
    expect(getLidMultiplier('full')).toBe(0.25);
  });

  it('returns 0.0 for sealed', () => {
    expect(getLidMultiplier('sealed')).toBe(0.0);
  });

  it('matches LID_MULTIPLIERS constant values', () => {
    const lidTypes: LidType[] = ['none', 'mesh', 'full', 'sealed'];
    for (const type of lidTypes) {
      expect(getLidMultiplier(type)).toBe(LID_MULTIPLIERS[type]);
    }
  });
});

describe('evaporationSystem', () => {
  it('has correct id and tier', () => {
    expect(evaporationSystem.id).toBe('evaporation');
    expect(evaporationSystem.tier).toBe('immediate');
  });

  it('returns waterLevel effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
    });

    const effects = evaporationSystem.update(state);

    expect(effects).toHaveLength(1);
    expect(effects[0].tier).toBe('immediate');
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

  it('respects lid type none (full evaporation)', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'none' },
    });

    const effects = evaporationSystem.update(state);

    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBeLessThan(0);
  });

  it('reduces evaporation with lid type mesh (75%)', () => {
    const stateNone = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'none' },
    });
    const stateMesh = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'mesh' },
    });

    const effectsNone = evaporationSystem.update(stateNone);
    const effectsMesh = evaporationSystem.update(stateMesh);

    expect(effectsMesh[0].delta).toBeCloseTo(effectsNone[0].delta * 0.75, 6);
  });

  it('reduces evaporation with lid type full (25%)', () => {
    const stateNone = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'none' },
    });
    const stateFull = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'full' },
    });

    const effectsNone = evaporationSystem.update(stateNone);
    const effectsFull = evaporationSystem.update(stateFull);

    expect(effectsFull[0].delta).toBeCloseTo(effectsNone[0].delta * 0.25, 6);
  });

  it('prevents all evaporation with lid type sealed', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      lid: { type: 'sealed' },
    });

    const effects = evaporationSystem.update(state);

    expect(effects).toHaveLength(0);
  });
});
