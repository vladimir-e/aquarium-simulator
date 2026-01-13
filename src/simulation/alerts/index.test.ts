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
  it('returns array of triggered alerts', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 15;
      draft.tick = 10;
    });

    const logs = checkAlerts(lowWaterState);

    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(1);
    expect(logs[0].severity).toBe('warning');
  });

  it('returns empty array when no alerts triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const logs = checkAlerts(state);

    expect(logs).toEqual([]);
  });

  it('filters out null results', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Full tank - no alerts should trigger
    const fullTankState = produce(state, (draft) => {
      draft.tank.waterLevel = 100;
    });

    const logs = checkAlerts(fullTankState);

    expect(logs).toEqual([]);
    expect(logs.every((log) => log !== null)).toBe(true);
  });

  it('works with multiple alert conditions', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Set up a state that triggers water level alert
    const alertState = produce(state, (draft) => {
      draft.tank.waterLevel = 10;
    });

    const logs = checkAlerts(alertState);

    // Should have at least the water level alert
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((log) => log.source === 'evaporation')).toBe(true);
  });

  it('includes tick information from state', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowWaterState = produce(state, (draft) => {
      draft.tank.waterLevel = 10;
      draft.tick = 42;
    });

    const logs = checkAlerts(lowWaterState);

    expect(logs[0].tick).toBe(42);
  });
});
