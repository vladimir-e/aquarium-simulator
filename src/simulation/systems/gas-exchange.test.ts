import { describe, it, expect } from 'vitest';
import {
  gasExchangeSystem,
  calculateO2Saturation,
  calculateFlowFactor,
  calculateGasExchange,
  calculateAerationFactor,
} from './gas-exchange.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';

describe('calculateO2Saturation', () => {
  it('returns base saturation at reference temperature (15°C)', () => {
    const saturation = calculateO2Saturation(gasExchangeDefaults.o2ReferenceTemp);
    expect(saturation).toBeCloseTo(gasExchangeDefaults.o2SaturationBase, 2);
  });

  it('returns lower saturation at higher temperatures', () => {
    const cold = calculateO2Saturation(15);
    const warm = calculateO2Saturation(25);
    const hot = calculateO2Saturation(35);

    expect(warm).toBeLessThan(cold);
    expect(hot).toBeLessThan(warm);
  });

  it('returns ~9.2 mg/L at 20°C', () => {
    const saturation = calculateO2Saturation(20);
    // 10.08 + (-0.17) * (20 - 15) = 10.08 - 0.85 = 9.23
    expect(saturation).toBeCloseTo(9.23, 2);
  });

  it('returns ~7.5 mg/L at 30°C', () => {
    const saturation = calculateO2Saturation(30);
    // 10.08 + (-0.17) * (30 - 15) = 10.08 - 2.55 = 7.53
    expect(saturation).toBeCloseTo(7.53, 2);
  });

  it('has minimum of 4 mg/L even at extreme temperatures', () => {
    const extremeHot = calculateO2Saturation(100);
    expect(extremeHot).toBeGreaterThanOrEqual(4.0);
  });

  it('follows linear relationship with temperature', () => {
    const t1 = calculateO2Saturation(20);
    const t2 = calculateO2Saturation(30);
    // Should differ by 10°C * slope
    expect(t1 - t2).toBeCloseTo(10 * Math.abs(gasExchangeDefaults.o2SaturationSlope), 2);
  });
});

describe('calculateFlowFactor', () => {
  it('returns 0 when tank capacity is 0', () => {
    const factor = calculateFlowFactor(100, 0);
    expect(factor).toBe(0);
  });

  it('returns 0 when flow is 0', () => {
    const factor = calculateFlowFactor(0, 100);
    expect(factor).toBe(0);
  });

  it('returns 1.0 at optimal flow turnover', () => {
    // 100L tank, 10 turnovers/hr = 1000 L/hr flow
    const optimalFlow = gasExchangeDefaults.optimalFlowTurnover * 100;
    const factor = calculateFlowFactor(optimalFlow, 100);
    expect(factor).toBeCloseTo(1.0, 2);
  });

  it('returns 0.5 at half optimal flow', () => {
    // 100L tank, 5 turnovers/hr = 500 L/hr flow
    const halfOptimalFlow = (gasExchangeDefaults.optimalFlowTurnover * 100) / 2;
    const factor = calculateFlowFactor(halfOptimalFlow, 100);
    expect(factor).toBeCloseTo(0.5, 2);
  });

  it('caps at 1.0 for very high flow', () => {
    // Way above optimal
    const factor = calculateFlowFactor(10000, 100);
    expect(factor).toBe(1.0);
  });

  it('scales linearly with flow below optimal', () => {
    const factor1 = calculateFlowFactor(200, 100);
    const factor2 = calculateFlowFactor(400, 100);
    expect(factor2).toBeCloseTo(factor1 * 2, 2);
  });
});

describe('calculateGasExchange', () => {
  it('returns 0 when current equals target', () => {
    const delta = calculateGasExchange(8.0, 8.0, 0.1, 1.0);
    expect(delta).toBe(0);
  });

  it('returns positive delta when current < target', () => {
    const delta = calculateGasExchange(6.0, 8.0, 0.1, 1.0);
    expect(delta).toBeGreaterThan(0);
  });

  it('returns negative delta when current > target', () => {
    const delta = calculateGasExchange(10.0, 8.0, 0.1, 1.0);
    expect(delta).toBeLessThan(0);
  });

  it('scales with flow factor', () => {
    const deltaFull = calculateGasExchange(6.0, 8.0, 0.1, 1.0);
    const deltaHalf = calculateGasExchange(6.0, 8.0, 0.1, 0.5);
    expect(deltaHalf).toBeCloseTo(deltaFull / 2, 4);
  });

  it('scales with base rate', () => {
    const deltaRate1 = calculateGasExchange(6.0, 8.0, 0.1, 1.0);
    const deltaRate2 = calculateGasExchange(6.0, 8.0, 0.2, 1.0);
    expect(deltaRate2).toBeCloseTo(deltaRate1 * 2, 4);
  });

  it('calculates correct exponential decay step', () => {
    // Delta = rate * flowFactor * (target - current)
    const delta = calculateGasExchange(6.0, 8.0, gasExchangeDefaults.baseExchangeRate, 1.0);
    expect(delta).toBeCloseTo(gasExchangeDefaults.baseExchangeRate * (8.0 - 6.0), 4);
  });

  it('returns 0 when flow factor is 0', () => {
    const delta = calculateGasExchange(6.0, 8.0, 0.1, 0);
    expect(delta).toBe(0);
  });
});

describe('calculateAerationFactor', () => {
  it('returns 1.0 when aeration is not active', () => {
    expect(calculateAerationFactor(false, 2.0)).toBe(1.0);
  });

  it('returns multiplier when aeration is active', () => {
    expect(calculateAerationFactor(true, 2.0)).toBe(2.0);
    expect(calculateAerationFactor(true, 3.0)).toBe(3.0);
  });

  it('returns 1.0 even with high multiplier if aeration is off', () => {
    expect(calculateAerationFactor(false, 10.0)).toBe(1.0);
  });
});

describe('gasExchangeSystem', () => {
  function createTestState(overrides: Partial<{
    oxygen: number;
    co2: number;
    temperature: number;
    flow: number;
    capacity: number;
    aeration: boolean;
  }> = {}): SimulationState {
    const capacity = overrides.capacity ?? 100;
    const state = createSimulation({ tankCapacity: capacity });
    return produce(state, (draft) => {
      if (overrides.oxygen !== undefined) {
        draft.resources.oxygen = overrides.oxygen;
      }
      if (overrides.co2 !== undefined) {
        draft.resources.co2 = overrides.co2;
      }
      if (overrides.temperature !== undefined) {
        draft.resources.temperature = overrides.temperature;
      }
      if (overrides.flow !== undefined) {
        draft.resources.flow = overrides.flow;
      }
      if (overrides.aeration !== undefined) {
        draft.resources.aeration = overrides.aeration;
      }
    });
  }

  it('has correct id and tier', () => {
    expect(gasExchangeSystem.id).toBe('gas-exchange');
    expect(gasExchangeSystem.tier).toBe('passive');
  });

  it('creates O2 effect when below saturation', () => {
    const state = createTestState({
      oxygen: 6.0,
      temperature: 25,
      flow: 500, // Some flow to enable exchange
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    const o2Effect = effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    expect(o2Effect!.delta).toBeGreaterThan(0); // Moving toward saturation
    expect(o2Effect!.source).toBe('gas-exchange-o2');
    expect(o2Effect!.tier).toBe('passive');
  });

  it('creates CO2 effect when above atmospheric', () => {
    const state = createTestState({
      co2: 10.0, // Above atmospheric (~4 mg/L)
      flow: 500,
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    expect(co2Effect!.delta).toBeLessThan(0); // Off-gassing toward atmospheric
    expect(co2Effect!.source).toBe('gas-exchange-co2');
    expect(co2Effect!.tier).toBe('passive');
  });

  it('creates positive CO2 effect when below atmospheric', () => {
    const state = createTestState({
      co2: 2.0, // Below atmospheric (~4 mg/L)
      flow: 500,
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    expect(co2Effect!.delta).toBeGreaterThan(0); // Absorbing toward atmospheric
  });

  it('creates no effects when already at equilibrium', () => {
    const saturation = calculateO2Saturation(25);
    const state = createTestState({
      oxygen: saturation,
      co2: gasExchangeDefaults.atmosphericCo2,
      temperature: 25,
      flow: 500,
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    // Effects might be very small but effectively 0
    effects.forEach((e) => {
      expect(Math.abs(e.delta)).toBeLessThan(0.01);
    });
  });

  it('exchange rate scales with flow', () => {
    const lowFlowState = createTestState({
      oxygen: 6.0,
      flow: 100,
      capacity: 100,
    });
    const highFlowState = createTestState({
      oxygen: 6.0,
      flow: 500,
      capacity: 100,
    });

    const lowFlowEffects = gasExchangeSystem.update(lowFlowState, DEFAULT_CONFIG);
    const highFlowEffects = gasExchangeSystem.update(highFlowState, DEFAULT_CONFIG);

    const lowO2Delta = lowFlowEffects.find((e) => e.resource === 'oxygen')?.delta ?? 0;
    const highO2Delta = highFlowEffects.find((e) => e.resource === 'oxygen')?.delta ?? 0;

    expect(highO2Delta).toBeGreaterThan(lowO2Delta);
  });

  it('O2 saturation depends on temperature', () => {
    const coldState = createTestState({
      oxygen: 6.0,
      temperature: 15,
      flow: 500,
    });
    const hotState = createTestState({
      oxygen: 6.0,
      temperature: 30,
      flow: 500,
    });

    const coldEffects = gasExchangeSystem.update(coldState, DEFAULT_CONFIG);
    const hotEffects = gasExchangeSystem.update(hotState, DEFAULT_CONFIG);

    const coldO2Delta = coldEffects.find((e) => e.resource === 'oxygen')?.delta ?? 0;
    const hotO2Delta = hotEffects.find((e) => e.resource === 'oxygen')?.delta ?? 0;

    // Cold water has higher saturation, so more room to increase
    expect(coldO2Delta).toBeGreaterThan(hotO2Delta);
  });

  it('creates no effects with zero flow and no aeration', () => {
    const state = createTestState({
      oxygen: 6.0,
      co2: 10.0,
      flow: 0,
      aeration: false,
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    // With zero flow and no aeration, no gas exchange occurs
    expect(effects.length).toBe(0);
  });

  it('CO2 equilibrates toward atmospheric constant', () => {
    const state = createTestState({
      co2: 20.0,
      flow: 500,
    });
    const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

    const co2Effect = effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    // Should move 20 -> 4, so negative delta
    expect(co2Effect!.delta).toBeLessThan(0);
  });

  describe('aeration effects', () => {
    it('adds direct O2 injection when aeration is active', () => {
      const state = createTestState({
        oxygen: 6.0,
        flow: 0, // No flow, but aeration provides direct O2
        aeration: true,
      });
      const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

      const directO2Effect = effects.find((e) => e.source === 'aeration-direct-o2');
      expect(directO2Effect).toBeDefined();
      expect(directO2Effect!.delta).toBeGreaterThan(0);
    });

    it('does not add direct O2 above saturation', () => {
      const state = createTestState({
        oxygen: 10.0, // Above saturation
        temperature: 25,
        flow: 0,
        aeration: true,
      });
      const effects = gasExchangeSystem.update(state, DEFAULT_CONFIG);

      const directO2Effect = effects.find((e) => e.source === 'aeration-direct-o2');
      expect(directO2Effect).toBeUndefined();
    });

    it('increases gas exchange rate when aeration is active', () => {
      const noAerationState = createTestState({
        oxygen: 6.0,
        flow: 500,
        aeration: false,
      });
      const aerationState = createTestState({
        oxygen: 6.0,
        flow: 500,
        aeration: true,
      });

      const noAerationEffects = gasExchangeSystem.update(noAerationState, DEFAULT_CONFIG);
      const aerationEffects = gasExchangeSystem.update(aerationState, DEFAULT_CONFIG);

      const noAerationO2 = noAerationEffects.find((e) => e.source === 'gas-exchange-o2')?.delta ?? 0;
      const aerationO2 = aerationEffects.find((e) => e.source === 'gas-exchange-o2')?.delta ?? 0;

      // Aeration should increase O2 exchange rate
      expect(aerationO2).toBeGreaterThan(noAerationO2);
    });

    it('increases CO2 off-gassing when aeration is active', () => {
      const noAerationState = createTestState({
        co2: 20.0, // High CO2
        flow: 500,
        aeration: false,
      });
      const aerationState = createTestState({
        co2: 20.0,
        flow: 500,
        aeration: true,
      });

      const noAerationEffects = gasExchangeSystem.update(noAerationState, DEFAULT_CONFIG);
      const aerationEffects = gasExchangeSystem.update(aerationState, DEFAULT_CONFIG);

      const noAerationCO2 = noAerationEffects.find((e) => e.source === 'gas-exchange-co2')?.delta ?? 0;
      const aerationCO2 = aerationEffects.find((e) => e.source === 'gas-exchange-co2')?.delta ?? 0;

      // Both should be negative (off-gassing), but aeration should off-gas more
      expect(aerationCO2).toBeLessThan(noAerationCO2);
    });
  });
});
