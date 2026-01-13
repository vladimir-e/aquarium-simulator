import { describe, it, expect } from 'vitest';
import { atoUpdate, WATER_LEVEL_THRESHOLD } from './ato.js';
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
      tank: { ...state.tank, waterLevel: 90 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects).toHaveLength(0);
  });

  it('does nothing when water level >= 99%', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    // Water level is at 100% by default

    const effects = atoUpdate(state);

    expect(effects).toHaveLength(0);
  });

  it('does nothing when water level is exactly at threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const thresholdState = {
      ...state,
      tank: { ...state.tank, waterLevel: 100 * WATER_LEVEL_THRESHOLD },
    };

    const effects = atoUpdate(thresholdState);

    expect(effects).toHaveLength(0);
  });

  it('adds water to restore 100% when level < 99% and enabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      tank: { ...state.tank, waterLevel: 90 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBe(10); // Restore from 90 to 100
  });

  it('restores to exactly tank capacity (100%)', () => {
    const state = createSimulation({
      tankCapacity: 200,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      tank: { ...state.tank, waterLevel: 150 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBe(50); // Restore from 150 to 200
  });

  it('emits immediate tier effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      tank: { ...state.tank, waterLevel: 90 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects[0].tier).toBe('immediate');
  });

  it('sets correct source for effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      tank: { ...state.tank, waterLevel: 90 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects[0].source).toBe('ato');
  });

  it('sets correct resource for effect', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = {
      ...state,
      tank: { ...state.tank, waterLevel: 90 },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects[0].resource).toBe('waterLevel');
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
      tank: { ...state.tank, waterLevel: justBelowThreshold },
    };

    const effects = atoUpdate(lowWaterState);

    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBeCloseTo(100 - justBelowThreshold, 6);
  });
});

describe('WATER_LEVEL_THRESHOLD', () => {
  it('is set to 0.99 (99%)', () => {
    expect(WATER_LEVEL_THRESHOLD).toBe(0.99);
  });
});
