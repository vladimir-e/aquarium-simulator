import { describe, it, expect } from 'vitest';
import {
  decaySystem,
  getTemperatureFactor,
  calculateDecay,
} from './decay.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { decayDefaults } from '../config/decay.js';
import { MW_CO2, MW_O2 } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';

const SATURATED_O2 = 8;
const AT_SATURATION = monodFactor(SATURATED_O2, decayDefaults.oxygenHalfSaturation);

describe('getTemperatureFactor', () => {
  const { q10, referenceTemp } = decayDefaults;

  it('is 1 at the reference temperature and q10 per 10 °C either way', () => {
    expect(getTemperatureFactor(referenceTemp)).toBeCloseTo(1, 10);
    expect(getTemperatureFactor(referenceTemp + 10)).toBeCloseTo(q10, 10);
    expect(getTemperatureFactor(referenceTemp - 10)).toBeCloseTo(1 / q10, 10);
  });
});

describe('calculateDecay', () => {
  it('returns 0 when food is 0', () => {
    const decay = calculateDecay(0, 25, SATURATED_O2);
    expect(decay).toBe(0);
  });

  it('returns 0 when food is negative', () => {
    const decay = calculateDecay(-1, 25, SATURATED_O2);
    expect(decay).toBe(0);
  });

  it('takes the base fraction per hour at reference temperature', () => {
    const decay = calculateDecay(1, 25, SATURATED_O2);
    expect(decay).toBeCloseTo(decayDefaults.baseDecayRate * AT_SATURATION, 6);
  });

  it('runs q10 faster ten degrees above reference', () => {
    const decay = calculateDecay(1, 35, SATURATED_O2);
    expect(decay).toBeCloseTo(calculateDecay(1, 25, SATURATED_O2) * decayDefaults.q10, 6);
  });

  it('never decays more than available food', () => {
    const decay = calculateDecay(0.01, 50, SATURATED_O2);
    expect(decay).toBeLessThanOrEqual(0.01);
  });

  it('scales linearly with food amount', () => {
    const decay1 = calculateDecay(1, 25, SATURATED_O2);
    const decay2 = calculateDecay(2, 25, SATURATED_O2);
    expect(decay2).toBeCloseTo(decay1 * 2, 6);
  });
});

describe('calculateDecay — oxygen availability', () => {
  it('runs at half its base rate at the half-saturation constant', () => {
    const half = calculateDecay(1, 25, decayDefaults.oxygenHalfSaturation);

    expect(half).toBeCloseTo(decayDefaults.baseDecayRate * 0.5, 9);
  });

  it('stops entirely in water with no oxygen, so the sludge stands', () => {
    expect(calculateDecay(1, 25, 0)).toBe(0);
  });

  it('falls monotonically as the water empties', () => {
    let previous = Infinity;
    for (const oxygen of [8, 4, 2, 1, 0.5, 0.1, 0]) {
      const decayed = calculateDecay(1, 25, oxygen);
      expect(decayed).toBeGreaterThanOrEqual(0);
      expect(decayed).toBeLessThan(previous);
      previous = decayed;
    }
  });
});

describe('decaySystem', () => {
  function createTestState(overrides: Partial<{
    food: number;
    waste: number;
    temperature: number;
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
      if (overrides.water !== undefined) {
        draft.resources.water = overrides.water;
      }
    });
  }

  it('turns the waste-conversion share of decayed food into waste', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const foodEffect = effects.find((e) => e.resource === 'food');
    const wasteEffect = effects.find(
      (e) => e.resource === 'waste' && e.source === 'decay'
    );

    expect(wasteEffect).toBeDefined();
    expect(wasteEffect!.delta).toBeCloseTo(
      -foodEffect!.delta * decayDefaults.wasteConversionRatio,
      6
    );
  });

  it('creates no effects at all when food is 0', () => {
    const state = createTestState({ food: 0 });

    expect(decaySystem.update(state, DEFAULT_CONFIG)).toEqual([]);
  });

  it('temperature affects decay rate', () => {
    const coldState = createTestState({ food: 1.0, temperature: 20 });
    const hotState = createTestState({ food: 1.0, temperature: 30 });

    const coldEffects = decaySystem.update(coldState, DEFAULT_CONFIG);
    const hotEffects = decaySystem.update(hotState, DEFAULT_CONFIG);

    const coldDecay = coldEffects.find((e) => e.resource === 'food')!.delta;
    const hotDecay = hotEffects.find((e) => e.resource === 'food')!.delta;

    expect(hotDecay).toBeLessThan(coldDecay);
  });

  it('creates CO2 effect when food decays', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    expect(co2Effect!.delta).toBeGreaterThan(0);
    expect(co2Effect!.source).toBe('decay');
    expect(co2Effect!.tier).toBe('passive');
  });

  it('creates negative O2 effect when food decays', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const o2Effect = effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    expect(o2Effect!.delta).toBeLessThan(0);
    expect(o2Effect!.source).toBe('decay');
    expect(o2Effect!.tier).toBe('passive');
  });

  it('breathes one mole of O2 for every mole of CO2 it exhales', () => {
    const state = createTestState({ food: 1.0, temperature: 25 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');

    expect(co2Effect!.delta / MW_CO2).toBeCloseTo(-o2Effect!.delta / MW_O2, 10);
  });

  it('draws the oxygen the oxidised fraction demands', () => {
    const state = createTestState({ food: 1.0, temperature: 25, water: 100 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const foodEffect = effects.find((e) => e.resource === 'food')!;
    const o2Effect = effects.find((e) => e.resource === 'oxygen')!;

    const decayAmount = -foodEffect.delta;
    const oxidizedAmount = decayAmount * (1 - decayDefaults.wasteConversionRatio);
    const expectedO2 = (oxidizedAmount * decayDefaults.gasExchangePerGramDecay) / 100;

    expect(-o2Effect.delta).toBeCloseTo(expectedO2, 6);
  });

  it('spends a mass of oxygen, so ten times the water is a tenth of the demand', () => {
    const drawnIn = (water: number): number => {
      const state = createTestState({ food: 1.0, temperature: 25, water });
      const effects = decaySystem.update(state, DEFAULT_CONFIG);
      return -effects.find((e) => e.resource === 'oxygen')!.delta;
    };

    expect(drawnIn(100) / drawnIn(1000)).toBeCloseTo(10, 6);
  });

  it('handles zero water volume gracefully (no CO2/O2 effects)', () => {
    const state = createTestState({ food: 1.0, temperature: 25, water: 0 });
    const effects = decaySystem.update(state, DEFAULT_CONFIG);

    const foodEffect = effects.find((e) => e.resource === 'food');
    const wasteEffect = effects.find((e) => e.resource === 'waste' && e.source === 'decay');
    expect(foodEffect).toBeDefined();
    expect(wasteEffect).toBeDefined();

    const co2Effect = effects.find((e) => e.resource === 'co2');
    const o2Effect = effects.find((e) => e.resource === 'oxygen');
    expect(co2Effect).toBeUndefined();
    expect(o2Effect).toBeUndefined();
  });
});
