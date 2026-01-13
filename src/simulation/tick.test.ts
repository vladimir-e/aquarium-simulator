import { describe, it, expect, beforeEach } from 'vitest';
import { tick, getHourOfDay, getDayNumber } from './tick.js';
import { createSimulation, type SimulationState } from './state.js';

describe('tick', () => {
  let initialState: SimulationState;

  beforeEach(() => {
    // Water at room temp means no temperature drift
    initialState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
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

  it('preserves tank capacity', () => {
    const newState = tick(initialState);

    expect(newState.tank.capacity).toBe(100);
  });
});

describe('tick integration', () => {
  it('temperature drifts toward room temp over time', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
      roomTemperature: 22,
    });

    state = tick(state);

    // Temperature should decrease toward room temp
    expect(state.resources.temperature).toBeLessThan(28);
    expect(state.resources.temperature).toBeGreaterThan(22);
  });

  it('water level decreases due to evaporation', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
    });

    state = tick(state);

    expect(state.tank.waterLevel).toBeLessThan(100);
  });

  it('heater counteracts temperature drift', () => {
    let stateWithHeater = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 100 },
    });

    let stateWithoutHeater = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: false, targetTemperature: 25, wattage: 100 },
    });

    stateWithHeater = tick(stateWithHeater);
    stateWithoutHeater = tick(stateWithoutHeater);

    // With heater, temp should be higher than without
    expect(stateWithHeater.resources.temperature).toBeGreaterThan(
      stateWithoutHeater.resources.temperature
    );
  });

  it('heater sets isOn to true when heating', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
    });

    state = tick(state);

    expect(state.equipment.heater.isOn).toBe(true);
  });

  it('heater sets isOn to false when at target', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 25, // No drift when room temp equals water temp
      heater: { enabled: true, isOn: true, targetTemperature: 25, wattage: 100 },
    });

    state = tick(state);

    expect(state.equipment.heater.isOn).toBe(false);
  });

  it('heater does nothing when disabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
      heater: { enabled: false, isOn: false, targetTemperature: 28, wattage: 100 },
    });

    const newState = tick(state);

    // Temperature shouldn't change (both water and room are at 22)
    // and heater is disabled
    expect(newState.equipment.heater.isOn).toBe(false);
    // Temperature stays at 22 (no drift since room == water temp)
    expect(newState.resources.temperature).toBeCloseTo(22, 1);
  });

  it('simulation reaches equilibrium with heater on', () => {
    // Start cold, heater should warm up and eventually stabilize
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 130 }, // 1.3 W/L
    });

    // Run for many ticks to approach equilibrium
    for (let i = 0; i < 100; i++) {
      state = tick(state);
    }

    // Should be between room temp and target temp
    // (equilibrium point depends on heater power vs cooling rate)
    expect(state.resources.temperature).toBeGreaterThan(20);
    expect(state.resources.temperature).toBeLessThanOrEqual(25);
  });

  it('underpowered heater plateaus below target', () => {
    // Very low wattage heater won't reach target
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30, wattage: 10 }, // Very weak
    });

    // Run for many ticks to approach equilibrium
    for (let i = 0; i < 200; i++) {
      state = tick(state);
    }

    // Should plateau well below target due to underpowered heater
    expect(state.resources.temperature).toBeLessThan(30);
    expect(state.resources.temperature).toBeGreaterThan(20);
    expect(state.equipment.heater.isOn).toBe(true); // Still trying to heat
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

describe('tick passive resources', () => {
  it('recalculates passive resources each tick', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
      filter: { enabled: true, type: 'sponge' },
    });

    const initialResources = state.passiveResources;
    const newState = tick(state);

    // Passive resources should be recalculated (same value since equipment unchanged)
    expect(newState.passiveResources).toBeDefined();
    expect(newState.passiveResources.surface).toBe(initialResources.surface);
    expect(newState.passiveResources.flow).toBe(initialResources.flow);
  });

  it('passive resources update when filter enabled state changes', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
      filter: { enabled: true, type: 'canister' },
      powerhead: { enabled: false },
    });

    const initialFlow = state.passiveResources.flow;
    expect(initialFlow).toBe(600); // Canister flow

    // Disable filter
    state = {
      ...state,
      equipment: {
        ...state.equipment,
        filter: { ...state.equipment.filter, enabled: false },
      },
    };

    // Run tick to recalculate
    const newState = tick(state);

    expect(newState.passiveResources.flow).toBe(0);
    expect(newState.passiveResources.surface).toBeLessThan(
      createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
      }).passiveResources.surface
    );
  });

  it('passive resources update when powerhead flow rate changes', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
      filter: { enabled: false },
      powerhead: { enabled: true, flowRateGPH: 240 },
    });

    expect(state.passiveResources.flow).toBe(908); // 240 GPH

    // Change powerhead flow rate
    state = {
      ...state,
      equipment: {
        ...state.equipment,
        powerhead: { ...state.equipment.powerhead, flowRateGPH: 850 },
      },
    };

    // Run tick to recalculate
    const newState = tick(state);

    expect(newState.passiveResources.flow).toBe(3218); // 850 GPH
  });
});

describe('tick alerts integration', () => {
  it('preserves logs array through tick', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const newState = tick(state);

    expect(Array.isArray(newState.logs)).toBe(true);
  });

  it('adds alert logs to state.logs', () => {
    // Create state with low water level to trigger alert
    let state = createSimulation({ tankCapacity: 100 });
    // Manually set water level below 20% threshold
    state = {
      ...state,
      tank: {
        ...state.tank,
        waterLevel: 15, // 15% of 100L
      },
    };

    const initialLogCount = state.logs.length;
    const newState = tick(state);

    // Should have added a water level alert
    expect(newState.logs.length).toBeGreaterThan(initialLogCount);
    const alertLog = newState.logs.find(
      (log) => log.source === 'evaporation' && log.severity === 'warning'
    );
    expect(alertLog).toBeDefined();
  });

  it('alerts run after passive effects tier', () => {
    // This test verifies alerts see the state after evaporation
    // If water level drops below 20% due to evaporation, alert should trigger
    let state = createSimulation({ tankCapacity: 100 });
    // Set water level just above 20% so evaporation might push it below
    state = {
      ...state,
      tank: {
        ...state.tank,
        waterLevel: 20.1, // Just above threshold
      },
    };

    // Run enough ticks for evaporation to drop below threshold
    for (let i = 0; i < 100; i++) {
      state = tick(state);
    }

    // Should eventually get a water level alert
    const hasWaterAlert = state.logs.some(
      (log) => log.source === 'evaporation' && log.severity === 'warning'
    );
    expect(hasWaterAlert).toBe(true);
  });

  it('logs accumulate across multiple ticks', () => {
    let state = createSimulation({ tankCapacity: 100 });
    const initialLogCount = state.logs.length;

    // Run 5 ticks
    for (let i = 0; i < 5; i++) {
      state = tick(state);
    }

    // Logs should still be present (and possibly have more from alerts)
    expect(state.logs.length).toBeGreaterThanOrEqual(initialLogCount);
  });
});
