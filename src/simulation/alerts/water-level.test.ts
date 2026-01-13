import { describe, it, expect } from 'vitest';
import { waterLevelAlert, WATER_LEVEL_CRITICAL_THRESHOLD } from './water-level.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('waterLevelAlert', () => {
  it('has correct id', () => {
    expect(waterLevelAlert.id).toBe('water-level-critical');
  });

  it('returns warning log when water level < 20% capacity and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set water level to 15% (below 20% threshold)
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.tick = 50;
    });

    const result = waterLevelAlert.check(lowWaterState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('evaporation');
    expect(result.log!.tick).toBe(50);
    expect(result.alertState.waterLevelCritical).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set water level below threshold AND mark as already triggered
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.alertState.waterLevelCritical = true;
    });

    const result = waterLevelAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.waterLevelCritical).toBe(true);
  });

  it('returns null log when water level >= 20% capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set water level to exactly 20%
    const normalWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 20;
    });

    const result = waterLevelAlert.check(normalWaterState);

    expect(result.log).toBeNull();
    expect(result.alertState.waterLevelCritical).toBe(false);
  });

  it('returns null log when water level is 0 (tank empty)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const emptyTankState = produce(state, (draft) => {
      draft.tank.waterLevel = 0;
    });

    const result = waterLevelAlert.check(emptyTankState);

    expect(result.log).toBeNull();
    expect(result.alertState.waterLevelCritical).toBe(false);
  });

  it('log message includes current water level and percentage', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 15.5;
    });

    const result = waterLevelAlert.check(lowWaterState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('15.5L');
    expect(result.log!.message).toContain('15.5%');
  });

  it('log has correct severity (warning) and source (evaporation)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 10;
    });

    const result = waterLevelAlert.check(lowWaterState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('evaporation');
  });

  it('triggers at exactly below 20% threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // At exactly 20%, should NOT trigger
    const atThreshold = produce(state, (draft) => {
      draft.tank.waterLevel = 20;
    });
    const atResult = waterLevelAlert.check(atThreshold);
    expect(atResult.log).toBeNull();
    expect(atResult.alertState.waterLevelCritical).toBe(false);

    // Just below 20%, should trigger
    const belowThreshold = produce(state, (draft) => {
      draft.tank.waterLevel = 19.99;
    });
    const belowResult = waterLevelAlert.check(belowThreshold);
    expect(belowResult.log).not.toBeNull();
    expect(belowResult.alertState.waterLevelCritical).toBe(true);
  });

  it('works with different tank capacities', () => {
    const state = createSimulation({ tankCapacity: 200 });
    // 20% of 200L = 40L
    // Set to 38L (19% of capacity)
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 38;
    });

    const result = waterLevelAlert.check(lowWaterState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('38.0L');
    expect(result.log!.message).toContain('19.0%');
  });

  it('clears alert state when water level goes back above threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Previously triggered, but water is now above threshold
    const recoveredState = produce(state, (draft) => {
      draft.tank.waterLevel = 25;
      draft.alertState.waterLevelCritical = true;
    });

    const result = waterLevelAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.waterLevelCritical).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.alertState.waterLevelCritical = false;
    });
    const firstResult = waterLevelAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.tank.waterLevel = 25;
      draft.alertState.waterLevelCritical = true;
    });
    const recoveredResult = waterLevelAlert.check(recovered);
    expect(recoveredResult.alertState.waterLevelCritical).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.alertState.waterLevelCritical = false;
    });
    const secondResult = waterLevelAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });
});

describe('WATER_LEVEL_CRITICAL_THRESHOLD', () => {
  it('is set to 0.2 (20%)', () => {
    expect(WATER_LEVEL_CRITICAL_THRESHOLD).toBe(0.2);
  });
});
