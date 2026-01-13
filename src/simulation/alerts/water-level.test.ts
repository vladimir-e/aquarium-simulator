import { describe, it, expect } from 'vitest';
import { waterLevelAlert, WATER_LEVEL_CRITICAL_THRESHOLD } from './water-level.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('waterLevelAlert', () => {
  it('has correct id', () => {
    expect(waterLevelAlert.id).toBe('water-level-critical');
  });

  it('returns warning log when water level < 20% capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set water level to 15% (below 20% threshold)
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.tick = 50;
    });

    const log = waterLevelAlert.check(lowWaterState);

    expect(log).not.toBeNull();
    expect(log!.severity).toBe('warning');
    expect(log!.source).toBe('evaporation');
    expect(log!.tick).toBe(50);
  });

  it('returns null when water level >= 20% capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set water level to exactly 20%
    const normalWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 20;
    });

    const log = waterLevelAlert.check(normalWaterState);

    expect(log).toBeNull();
  });

  it('returns null when water level is 0 (tank empty)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const emptyTankState = produce(state, (draft) => {
      draft.tank.waterLevel = 0;
    });

    const log = waterLevelAlert.check(emptyTankState);

    expect(log).toBeNull();
  });

  it('log message includes current water level and percentage', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 15.5;
    });

    const log = waterLevelAlert.check(lowWaterState);

    expect(log).not.toBeNull();
    expect(log!.message).toContain('15.5L');
    expect(log!.message).toContain('15.5%');
  });

  it('log has correct severity (warning) and source (evaporation)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 10;
    });

    const log = waterLevelAlert.check(lowWaterState);

    expect(log).not.toBeNull();
    expect(log!.severity).toBe('warning');
    expect(log!.source).toBe('evaporation');
  });

  it('triggers at exactly below 20% threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // At exactly 20%, should NOT trigger
    const atThreshold = produce(state, (draft) => {
      draft.tank.waterLevel = 20;
    });
    expect(waterLevelAlert.check(atThreshold)).toBeNull();

    // Just below 20%, should trigger
    const belowThreshold = produce(state, (draft) => {
      draft.tank.waterLevel = 19.99;
    });
    expect(waterLevelAlert.check(belowThreshold)).not.toBeNull();
  });

  it('works with different tank capacities', () => {
    const state = createSimulation({ tankCapacity: 200 });
    // 20% of 200L = 40L
    // Set to 38L (19% of capacity)
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 38;
    });

    const log = waterLevelAlert.check(lowWaterState);

    expect(log).not.toBeNull();
    expect(log!.message).toContain('38.0L');
    expect(log!.message).toContain('19.0%');
  });
});

describe('WATER_LEVEL_CRITICAL_THRESHOLD', () => {
  it('is set to 0.2 (20%)', () => {
    expect(WATER_LEVEL_CRITICAL_THRESHOLD).toBe(0.2);
  });
});
