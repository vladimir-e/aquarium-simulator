import { describe, it, expect } from 'vitest';
import {
  decaySystem,
  getTemperatureFactor,
  calculateDecay,
  REFERENCE_TEMP,
  BASE_DECAY_RATE,
} from './decay.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';

describe('getTemperatureFactor', () => {
  it('returns 1.0 at reference temperature (25°C)', () => {
    const factor = getTemperatureFactor(REFERENCE_TEMP);
    expect(factor).toBeCloseTo(1.0, 6);
  });

  it('returns 2.0 at 35°C (Q10 = 2)', () => {
    const factor = getTemperatureFactor(35);
    expect(factor).toBeCloseTo(2.0, 6);
  });

  it('returns 0.5 at 15°C (Q10 = 2)', () => {
    const factor = getTemperatureFactor(15);
    expect(factor).toBeCloseTo(0.5, 6);
  });

  it('returns ~1.41 at 30°C', () => {
    const factor = getTemperatureFactor(30);
    // Q10^(5/10) = 2^0.5 = sqrt(2) ≈ 1.414
    expect(factor).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('returns ~0.71 at 20°C', () => {
    const factor = getTemperatureFactor(20);
    // Q10^(-5/10) = 2^-0.5 = 1/sqrt(2) ≈ 0.707
    expect(factor).toBeCloseTo(1 / Math.sqrt(2), 4);
  });

  it('returns 4.0 at 45°C (two doublings)', () => {
    const factor = getTemperatureFactor(45);
    expect(factor).toBeCloseTo(4.0, 6);
  });

  it('returns 0.25 at 5°C (two halvings)', () => {
    const factor = getTemperatureFactor(5);
    expect(factor).toBeCloseTo(0.25, 6);
  });
});

describe('calculateDecay', () => {
  it('returns 0 when food is 0', () => {
    const decay = calculateDecay(0, 25);
    expect(decay).toBe(0);
  });

  it('returns 0 when food is negative', () => {
    const decay = calculateDecay(-1, 25);
    expect(decay).toBe(0);
  });

  it('at 25°C with 1g food returns 0.05g (5%)', () => {
    const decay = calculateDecay(1, 25);
    expect(decay).toBeCloseTo(BASE_DECAY_RATE, 6);
  });

  it('at 30°C with 1g food returns ~0.07g (faster)', () => {
    const decay = calculateDecay(1, 30);
    // 5% * sqrt(2) ≈ 7.07%
    expect(decay).toBeCloseTo(0.05 * Math.sqrt(2), 4);
  });

  it('at 20°C with 1g food returns ~0.035g (slower)', () => {
    const decay = calculateDecay(1, 20);
    // 5% / sqrt(2) ≈ 3.54%
    expect(decay).toBeCloseTo(0.05 / Math.sqrt(2), 4);
  });

  it('at 35°C with 1g food returns 0.1g (10%)', () => {
    const decay = calculateDecay(1, 35);
    // 5% * 2 = 10%
    expect(decay).toBeCloseTo(0.10, 6);
  });

  it('never decays more than available food', () => {
    // Very high temperature, very small food amount
    const decay = calculateDecay(0.01, 50);
    expect(decay).toBeLessThanOrEqual(0.01);
  });

  it('very small food amounts decay correctly', () => {
    const decay = calculateDecay(0.1, 25);
    expect(decay).toBeCloseTo(0.005, 6); // 5% of 0.1g
  });

  it('scales linearly with food amount', () => {
    const decay1 = calculateDecay(1, 25);
    const decay2 = calculateDecay(2, 25);
    expect(decay2).toBeCloseTo(decay1 * 2, 6);
  });
});

describe('decaySystem', () => {
  function createTestState(overrides: Partial<{
    food: number;
    waste: number;
    temperature: number;
    ambientWaste: number;
  }> = {}): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      if (overrides.food !== undefined) {
        draft.resources.food = overrides.food;
      }
      if (overrides.waste !== undefined) {
        draft.resources.waste = overrides.waste;
      }
      if (overrides.temperature !== undefined) {
        draft.resources.temperature = overrides.temperature;
      }
      if (overrides.ambientWaste !== undefined) {
        draft.environment.ambientWaste = overrides.ambientWaste;
      }
    });
  }

  it('has correct id and tier', () => {
    expect(decaySystem.id).toBe('decay');
    expect(decaySystem.tier).toBe('passive');
  });

  it('creates negative food effect when food > 0', () => {
    const state = createTestState({ food: 1.0 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food');
    expect(foodEffect).toBeDefined();
    expect(foodEffect!.delta).toBeLessThan(0);
  });

  it('creates positive waste effect equal to decay amount', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food');
    const wasteEffect = effects.find(
      (e) => e.resource === 'waste' && e.source === 'decay'
    );

    expect(wasteEffect).toBeDefined();
    expect(wasteEffect!.delta).toBe(-foodEffect!.delta);
  });

  it('creates ambient waste effect (default 0.01 g/hour)', () => {
    const state = createTestState({ food: 0 });
    const effects = decaySystem.update(state);

    const ambientEffect = effects.find(
      (e) => e.resource === 'waste' && e.source === 'environment'
    );
    expect(ambientEffect).toBeDefined();
    expect(ambientEffect!.delta).toBe(0.01);
  });

  it('creates no food effect when food is 0', () => {
    const state = createTestState({ food: 0 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food');
    expect(foodEffect).toBeUndefined();
  });

  it('all effects have tier: passive', () => {
    const state = createTestState({ food: 1.0 });
    const effects = decaySystem.update(state);

    effects.forEach((effect) => {
      expect(effect.tier).toBe('passive');
    });
  });

  it('decay source is "decay"', () => {
    const state = createTestState({ food: 1.0 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food');
    expect(foodEffect!.source).toBe('decay');
  });

  it('ambient source is "environment"', () => {
    const state = createTestState({ food: 0 });
    const effects = decaySystem.update(state);

    const ambientEffect = effects.find((e) => e.resource === 'waste');
    expect(ambientEffect!.source).toBe('environment');
  });

  it('respects custom ambient waste rate', () => {
    const state = createTestState({ food: 0, ambientWaste: 0.02 });
    const effects = decaySystem.update(state);

    const ambientEffect = effects.find(
      (e) => e.resource === 'waste' && e.source === 'environment'
    );
    expect(ambientEffect!.delta).toBe(0.02);
  });

  it('temperature affects decay rate', () => {
    const coldState = createTestState({ food: 1.0, temperature: 20 });
    const hotState = createTestState({ food: 1.0, temperature: 30 });

    const coldEffects = decaySystem.update(coldState);
    const hotEffects = decaySystem.update(hotState);

    const coldDecay = coldEffects.find((e) => e.resource === 'food')!.delta;
    const hotDecay = hotEffects.find((e) => e.resource === 'food')!.delta;

    // Hot tank decays faster (more negative delta)
    expect(hotDecay).toBeLessThan(coldDecay);
  });
});
