import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { atoUpdate, WATER_LEVEL_THRESHOLD } from './ato.js';
import { createSimulation } from '../state.js';

describe('atoUpdate', () => {
  it('returns no effects when disabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: false },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const effects = atoUpdate(lowWaterState);

    expect(effects).toEqual([]);
  });

  it('returns no effects when water level >= 99%', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    // Water level is at 100% by default

    const effects = atoUpdate(state);

    expect(effects).toEqual([]);
  });

  it('returns no effects when water level is exactly at threshold', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const thresholdState = produce(state, (draft) => {
      draft.resources.water = 100 * WATER_LEVEL_THRESHOLD;
    });

    const effects = atoUpdate(thresholdState);

    expect(effects).toEqual([]);
  });

  it('returns water effect to restore to 100% when level < 99%', () => {
    const state = createSimulation({
      tankCapacity: 100,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const effects = atoUpdate(lowWaterState);

    const waterEffect = effects.find((e) => e.resource === 'water');
    expect(waterEffect).toBeDefined();
    expect(waterEffect!.delta).toBe(10); // 100 - 90
    expect(waterEffect!.source).toBe('ato');
    expect(waterEffect!.tier).toBe('immediate');
  });

  it('returns correct water delta for different tank capacity', () => {
    const state = createSimulation({
      tankCapacity: 200,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 150;
    });

    const effects = atoUpdate(lowWaterState);

    const waterEffect = effects.find((e) => e.resource === 'water');
    expect(waterEffect!.delta).toBe(50); // 200 - 150
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

    const effects = atoUpdate(lowWaterState);

    expect(effects.length).toBeGreaterThan(0);
    const waterEffect = effects.find((e) => e.resource === 'water');
    expect(waterEffect).toBeDefined();
  });
});

describe('atoUpdate temperature blending', () => {
  it('returns temperature effect when adding water', () => {
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
    // tempDelta = 25.4 - 26 = -0.6
    const effects = atoUpdate(lowWaterState);

    const tempEffect = effects.find((e) => e.resource === 'temperature');
    expect(tempEffect).toBeDefined();
    expect(tempEffect!.delta).toBeCloseTo(-0.6, 10);
    expect(tempEffect!.source).toBe('ato');
    expect(tempEffect!.tier).toBe('immediate');
  });

  it('returns correct temperature delta with larger water addition', () => {
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
    // tempDelta = 23 - 28 = -5
    const effects = atoUpdate(lowWaterState);

    const tempEffect = effects.find((e) => e.resource === 'temperature');
    expect(tempEffect!.delta).toBe(-5);
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
    // tempDelta = 23 - 25 = -2
    const effects = atoUpdate(lowWaterState);

    const tempEffect = effects.find((e) => e.resource === 'temperature');
    expect(tempEffect!.delta).toBe(-2);
  });

  it('does not include temperature effect when tap water equals tank temp', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      tapWaterTemperature: 25,
      ato: { enabled: true },
    });
    const lowWaterState = produce(state, (draft) => {
      draft.resources.water = 90;
    });

    const effects = atoUpdate(lowWaterState);

    // Should only have water effect, no temperature effect
    expect(effects.length).toBe(1);
    expect(effects[0].resource).toBe('water');
  });
});

describe('WATER_LEVEL_THRESHOLD', () => {
  it('is set to 0.99 (99%)', () => {
    expect(WATER_LEVEL_THRESHOLD).toBe(0.99);
  });
});
