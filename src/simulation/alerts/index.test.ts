import { describe, it, expect } from 'vitest';
import { alerts, checkAlerts, waterLevelAlert } from './index.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('alerts registry', () => {
  it('contains waterLevelAlert', () => {
    expect(alerts).toContain(waterLevelAlert);
  });

  it('is an array of alerts', () => {
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
  });
});

describe('checkAlerts', () => {
  it('returns result with logs array and updated alertState', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 15;
      draft.tick = 10;
    });

    const result = checkAlerts(lowWaterState);

    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBe(1);
    expect(result.logs[0].severity).toBe('warning');
    expect(result.alertState.waterLevelCritical).toBe(true);
  });

  it('returns empty logs array when no alerts triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const result = checkAlerts(state);

    expect(result.logs).toEqual([]);
    expect(result.alertState.waterLevelCritical).toBe(false);
  });

  it('filters out null log results', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Full tank - no alerts should trigger
    const fullTankState = produce(state, (draft) => {
      draft.resources.water = 100;
    });

    const result = checkAlerts(fullTankState);

    expect(result.logs).toEqual([]);
    expect(result.logs.every((log) => log !== null)).toBe(true);
  });

  it('works with multiple alert conditions', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set up a state that triggers water level alert
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 10;
    });

    const result = checkAlerts(lowWaterState);

    // Should have at least the water level alert
    expect(result.logs.length).toBeGreaterThanOrEqual(1);
    expect(result.logs.some((log) => log.source === 'evaporation')).toBe(true);
  });

  it('includes tick information from state', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 10;
      draft.tick = 42;
    });

    const result = checkAlerts(lowWaterState);

    expect(result.logs[0].tick).toBe(42);
  });

  it('does not re-trigger already triggered alerts', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.water = 10;
      draft.alertState.waterLevelCritical = true;
    });

    const result = checkAlerts(alreadyTriggeredState);

    expect(result.logs).toEqual([]);
    expect(result.alertState.waterLevelCritical).toBe(true);
  });

  it('clears alert state when condition no longer true', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const recoveredState = produce(state, (draft) => {
      draft.resources.water = 50;
      draft.alertState.waterLevelCritical = true;
    });

    const result = checkAlerts(recoveredState);

    expect(result.logs).toEqual([]);
    expect(result.alertState.waterLevelCritical).toBe(false);
  });
});
