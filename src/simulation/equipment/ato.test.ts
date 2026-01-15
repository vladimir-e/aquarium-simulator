import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { atoUpdate, applyAtoTemperatureBlending, WATER_LEVEL_THRESHOLD } from './ato.js';
import { createSimulation } from '../state.js';

describe('atoUpdate', () => {
  it('does nothing when disabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: false },
    });
    // Set water level below threshold
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 90 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects).toHaveLength(0);
    expect(result.waterToAdd).toBe(0);
  });

  it('does nothing when water level >= 99%', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    // Water level is at 100% by default

    const result = atoUpdate(state);

    expect(result.effects).toHaveLength(0);
    expect(result.waterToAdd).toBe(0);
  });

  it('does nothing when water level is exactly at threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const thresholdState = {
      ...state,
      resources: { ...state.resources, water: 100 * WATER_LEVEL_THRESHOLD },
    };

    const result = atoUpdate(thresholdState);

    expect(result.effects).toHaveLength(0);
    expect(result.waterToAdd).toBe(0);
  });

  it('adds water to restore 100% when level < 99% and enabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 90 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].delta).toBe(10); // Restore from 90 to 100
    expect(result.waterToAdd).toBe(10);
  });

  it('restores to exactly tank capacity (100%)', () => {
    const state = createSimulation({
      tankCapacity: 200,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 150 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].delta).toBe(50); // Restore from 150 to 200
    expect(result.waterToAdd).toBe(50);
  });

  it('emits immediate tier effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 90 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects[0].tier).toBe('immediate');
  });

  it('sets correct source for effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 90 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects[0].source).toBe('ato');
  });

  it('sets correct resource for effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: 90 },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects[0].resource).toBe('water');
  });

  it('triggers when water level is just below threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    // Just below 99%
    const justBelowThreshold = 100 * WATER_LEVEL_THRESHOLD - 0.001;
    const lowWaterState = {
      ...state,
      resources: { ...state.resources, water: justBelowThreshold },
    };

    const result = atoUpdate(lowWaterState);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].delta).toBeCloseTo(100 - justBelowThreshold, 6);
    expect(result.waterToAdd).toBeCloseTo(100 - justBelowThreshold, 6);
  });
});

describe('applyAtoTemperatureBlending', () => {
  it('does nothing when no water to add', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      tapWaterTemperature: 20,
    });

    const result = applyAtoTemperatureBlending(state, 0);

    expect(result.resources.temperature).toBe(25);
    expect(result).toBe(state); // Same reference when no change
  });

  it('blends temperature correctly when adding water', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 26,
      tapWaterTemperature: 20,
    });
    // Simulate water loss (90L remaining)
    state = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    // Adding 10L of tap water (20°C) to 90L of tank water (26°C)
    // newTemp = (26 * 90 + 20 * 10) / 100 = (2340 + 200) / 100 = 25.4
    const result = applyAtoTemperatureBlending(state, 10);

    expect(result.resources.temperature).toBe(25.4);
  });

  it('blends temperature with larger water addition', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
      tapWaterTemperature: 18,
    });
    // Simulate water loss (50L remaining)
    state = produce(state, (draft) => {
      draft.resources.water = 50;
    });

    // Adding 50L of tap water (18°C) to 50L of tank water (28°C)
    // newTemp = (28 * 50 + 18 * 50) / 100 = (1400 + 900) / 100 = 23
    const result = applyAtoTemperatureBlending(state, 50);

    expect(result.resources.temperature).toBe(23);
  });

  it('uses environment tap water temperature', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      tapWaterTemperature: 15, // Cold tap water
    });
    state = produce(state, (draft) => {
      draft.resources.water = 80;
    });

    // Adding 20L of 15°C tap to 80L of 25°C tank water
    // newTemp = (25 * 80 + 15 * 20) / 100 = (2000 + 300) / 100 = 23
    const result = applyAtoTemperatureBlending(state, 20);

    expect(result.resources.temperature).toBe(23);
  });

  it('logs ATO action', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      tapWaterTemperature: 20,
    });
    state = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const result = applyAtoTemperatureBlending(state, 10);

    const atoLog = result.logs.find(
      (log) => log.source === 'equipment' && log.message.includes('ATO')
    );
    expect(atoLog).toBeDefined();
    expect(atoLog!.message).toContain('10.0L');
  });

  it('rounds temperature to 2 decimal places', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25.333,
      tapWaterTemperature: 20.666,
    });
    state = produce(state, (draft) => {
      draft.resources.water = 97;
      draft.resources.temperature = 25.333;
    });

    const result = applyAtoTemperatureBlending(state, 3);

    // Temperature should be rounded to 2 decimal places
    expect(Number.isInteger(result.resources.temperature * 100)).toBe(true);
  });
});

describe('WATER_LEVEL_THRESHOLD', () => {
  it('is set to 0.99 (99%)', () => {
    expect(WATER_LEVEL_THRESHOLD).toBe(0.99);
  });
});
