import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { atoUpdate, WATER_LEVEL_THRESHOLD } from './ato.js';
import { createSimulation } from '../state.js';

describe('atoUpdate', () => {
  it('does nothing when disabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: false },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const result = atoUpdate(lowWaterState);

    expect(result).toBe(lowWaterState); // Unchanged
    expect(result.resources.water).toBe(90);
  });

  it('does nothing when water level >= 99%', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    // Water level is at 100% by default

    const result = atoUpdate(state);

    expect(result).toBe(state); // Unchanged
  });

  it('does nothing when water level is exactly at threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const thresholdState = produce(state, (draft) => {
      draft.resources.water = 100 * WATER_LEVEL_THRESHOLD;
    });

    const result = atoUpdate(thresholdState);

    expect(result).toBe(thresholdState); // Unchanged
  });

  it('restores water to 100% when level < 99% and enabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const result = atoUpdate(lowWaterState);

    expect(result.resources.water).toBe(100);
  });

  it('restores to exactly tank capacity', () => {
    const state = createSimulation({
      tankCapacity: 200,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 150;
    });

    const result = atoUpdate(lowWaterState);

    expect(result.resources.water).toBe(200);
  });

  it('triggers when water level is just below threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const justBelowThreshold = 100 * WATER_LEVEL_THRESHOLD - 0.001;
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = justBelowThreshold;
    });

    const result = atoUpdate(lowWaterState);

    expect(result.resources.water).toBe(100);
  });

  it('logs ATO action', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const result = atoUpdate(lowWaterState);

    const atoLog = result.logs.find(
      (log) => log.source === 'equipment' && log.message.includes('ATO')
    );
    expect(atoLog).toBeDefined();
    expect(atoLog!.message).toContain('10.0L');
  });
});

describe('atoUpdate temperature blending', () => {
  it('blends temperature when adding water', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 26,
      tapWaterTemperature: 20,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    // Adding 10L of tap water (20°C) to 90L of tank water (26°C)
    // newTemp = (26 * 90 + 20 * 10) / 100 = 25.4
    const result = atoUpdate(lowWaterState);

    expect(result.resources.temperature).toBe(25.4);
  });

  it('blends temperature with larger water addition', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
      tapWaterTemperature: 18,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 50;
    });

    // Adding 50L of tap water (18°C) to 50L of tank water (28°C)
    // newTemp = (28 * 50 + 18 * 50) / 100 = 23
    const result = atoUpdate(lowWaterState);

    expect(result.resources.temperature).toBe(23);
  });

  it('uses environment tap water temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      tapWaterTemperature: 15,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 80;
    });

    // Adding 20L of 15°C tap to 80L of 25°C tank water
    // newTemp = (25 * 80 + 15 * 20) / 100 = 23
    const result = atoUpdate(lowWaterState);

    expect(result.resources.temperature).toBe(23);
  });
});

describe('WATER_LEVEL_THRESHOLD', () => {
  it('is set to 0.99 (99%)', () => {
    expect(WATER_LEVEL_THRESHOLD).toBe(0.99);
  });
});
