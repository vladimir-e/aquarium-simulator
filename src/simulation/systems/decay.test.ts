import { describe, it, expect } from 'vitest';
import {
  decaySystem,
  getTemperatureFactor,
  calculateDecay,
  REFERENCE_TEMP,
  BASE_DECAY_RATE,
  WASTE_CONVERSION_RATIO,
  GAS_EXCHANGE_PER_GRAM_DECAY,
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
    water: number;
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
      if (overrides.water !== undefined) {
        draft.resources.water = overrides.water;
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

  it('creates positive waste effect at 40% of decay amount', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food');
    const wasteEffect = effects.find(
      (e) => e.resource === 'waste' && e.source === 'decay'
    );

    expect(wasteEffect).toBeDefined();
    // Waste is WASTE_CONVERSION_RATIO (40%) of decayed food
    expect(wasteEffect!.delta).toBeCloseTo(
      -foodEffect!.delta * WASTE_CONVERSION_RATIO,
      6
    );
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

  it('creates CO2 effect when food decays', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    expect(co2Effect!.delta).toBeGreaterThan(0);
    expect(co2Effect!.source).toBe('decay');
    expect(co2Effect!.tier).toBe('passive');
  });

  it('creates negative O2 effect when food decays', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state);

    const o2Effect = effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    expect(o2Effect!.delta).toBeLessThan(0);
    expect(o2Effect!.source).toBe('decay');
    expect(o2Effect!.tier).toBe('passive');
  });

  it('CO2 and O2 effects are equal and opposite', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');

    expect(co2Effect!.delta).toBeCloseTo(-o2Effect!.delta, 6);
  });

  it('CO2/O2 effects scale inversely with water volume', () => {
    const smallTankState = createTestState({ food: 1.0, temperature: 25, water: 50 });
    const largeTankState = createTestState({ food: 1.0, temperature: 25, water: 200 });

    const smallEffects = decaySystem.update(smallTankState);
    const largeEffects = decaySystem.update(largeTankState);

    const smallCo2 = smallEffects.find((e) => e.resource === 'co2')!.delta;
    const largeCo2 = largeEffects.find((e) => e.resource === 'co2')!.delta;

    // Small tank (50L) should have 4x the concentration change of large tank (200L)
    expect(smallCo2).toBeCloseTo(largeCo2 * 4, 4);
  });

  it('calculates correct CO2/O2 amounts based on decay', () => {
    // 100L tank, 1g food at 25°C
    const state = createTestState({ food: 1.0, temperature: 25, water: 100 });
    const effects = decaySystem.update(state);

    const foodEffect = effects.find((e) => e.resource === 'food')!;
    const co2Effect = effects.find((e) => e.resource === 'co2')!;

    const decayAmount = -foodEffect.delta; // 0.05g at 25°C
    const oxidizedAmount = decayAmount * (1 - WASTE_CONVERSION_RATIO); // 60%
    const expectedCo2 = (oxidizedAmount * GAS_EXCHANGE_PER_GRAM_DECAY) / 100; // mg/L

    expect(co2Effect.delta).toBeCloseTo(expectedCo2, 6);
  });

  it('temperature affects CO2/O2 effects (through decay rate)', () => {
    const coldState = createTestState({ food: 1.0, temperature: 20 });
    const hotState = createTestState({ food: 1.0, temperature: 30 });

    const coldEffects = decaySystem.update(coldState);
    const hotEffects = decaySystem.update(hotState);

    const coldCo2 = coldEffects.find((e) => e.resource === 'co2')!.delta;
    const hotCo2 = hotEffects.find((e) => e.resource === 'co2')!.delta;

    // Hot tank decays faster, produces more CO2
    expect(hotCo2).toBeGreaterThan(coldCo2);
  });

  it('no CO2/O2 effects when food is zero', () => {
    const state = createTestState({ food: 0 });
    const effects = decaySystem.update(state);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');

    expect(co2Effect).toBeUndefined();
    expect(o2Effect).toBeUndefined();
  });

  it('handles very small food amounts correctly', () => {
    const state = createTestState({ food: 0.01, temperature: 25, water: 100 });
    const effects = decaySystem.update(state);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');

    expect(co2Effect).toBeDefined();
    expect(o2Effect).toBeDefined();
    // Values should be very small but defined
    expect(co2Effect!.delta).toBeGreaterThan(0);
    expect(o2Effect!.delta).toBeLessThan(0);
  });

  it('handles large tank volumes correctly', () => {
    const state = createTestState({ food: 1.0, temperature: 25, water: 1000 });
    const effects = decaySystem.update(state);

    const co2Effect = effects.find((e) => e.resource === 'co2');

    // 1000L tank: decay=0.05g, oxidized=0.03g, CO2=0.03g*250mg/g/1000L = 0.0075 mg/L
    expect(co2Effect!.delta).toBeCloseTo(0.0075, 4);
  });

  it('handles zero water volume gracefully (no CO2/O2 effects)', () => {
    const state = createTestState({ food: 1.0, temperature: 25, water: 0 });
    const effects = decaySystem.update(state);

    // Decay still happens (food -> waste)
    const foodEffect = effects.find((e) => e.resource === 'food');
    const wasteEffect = effects.find((e) => e.resource === 'waste' && e.source === 'decay');
    expect(foodEffect).toBeDefined();
    expect(wasteEffect).toBeDefined();

    // But no gas effects (would be division by zero)
    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');
    expect(co2Effect).toBeUndefined();
    expect(o2Effect).toBeUndefined();
  });
});
