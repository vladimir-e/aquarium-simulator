import { describe, it, expect } from 'vitest';
import {
  getAirPumpOutput,
  getAirPumpFlow,
  isAirPumpUndersized,
  DEFAULT_AIR_PUMP,
  AIR_PUMP_SPEC,
} from './air-pump.js';

describe('DEFAULT_AIR_PUMP', () => {
  it('is disabled by default', () => {
    expect(DEFAULT_AIR_PUMP.enabled).toBe(false);
  });
});

describe('AIR_PUMP_SPEC', () => {
  it('has base air output', () => {
    expect(AIR_PUMP_SPEC.baseOutputLph).toBe(60);
  });

  it('has max capacity limit', () => {
    expect(AIR_PUMP_SPEC.maxCapacityLiters).toBe(400);
  });

  it('has flow per air ratio', () => {
    expect(AIR_PUMP_SPEC.flowPerAirLph).toBe(0.1);
  });
});

describe('getAirPumpOutput', () => {
  it('returns base output for small tanks (< 40L)', () => {
    expect(getAirPumpOutput(20)).toBe(60);
    expect(getAirPumpOutput(40)).toBe(60);
  });

  it('returns 2x output for medium tanks (40-150L)', () => {
    expect(getAirPumpOutput(41)).toBe(120);
    expect(getAirPumpOutput(100)).toBe(120);
    expect(getAirPumpOutput(150)).toBe(120);
  });

  it('returns 4x output for large tanks (150-400L)', () => {
    expect(getAirPumpOutput(151)).toBe(240);
    expect(getAirPumpOutput(300)).toBe(240);
    expect(getAirPumpOutput(400)).toBe(240);
  });

  it('returns capped output for very large tanks (> 400L)', () => {
    expect(getAirPumpOutput(401)).toBeCloseTo(400, 0);
    expect(getAirPumpOutput(1000)).toBeCloseTo(400, 0);
  });

  it('scales appropriately with tank size', () => {
    const small = getAirPumpOutput(30);
    const medium = getAirPumpOutput(100);
    const large = getAirPumpOutput(300);

    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });
});

describe('getAirPumpFlow', () => {
  it('returns flow contribution from bubble uplift', () => {
    // 60 L/h air * 0.1 = 6 L/h flow for small tank
    expect(getAirPumpFlow(30)).toBe(6);
  });

  it('scales with air output', () => {
    const smallFlow = getAirPumpFlow(30);
    const mediumFlow = getAirPumpFlow(100);
    const largeFlow = getAirPumpFlow(300);

    expect(mediumFlow).toBeGreaterThan(smallFlow);
    expect(largeFlow).toBeGreaterThan(mediumFlow);
  });

  it('returns rounded integer values', () => {
    const flow = getAirPumpFlow(100);
    expect(Number.isInteger(flow)).toBe(true);
  });

  it('calculates correct flow for medium tank', () => {
    // 120 L/h air * 0.1 = 12 L/h flow
    expect(getAirPumpFlow(100)).toBe(12);
  });

  it('calculates correct flow for large tank', () => {
    // 240 L/h air * 0.1 = 24 L/h flow
    expect(getAirPumpFlow(300)).toBe(24);
  });
});

describe('isAirPumpUndersized', () => {
  it('returns false for tanks within capacity', () => {
    expect(isAirPumpUndersized(100)).toBe(false);
    expect(isAirPumpUndersized(400)).toBe(false);
  });

  it('returns true for tanks exceeding capacity', () => {
    expect(isAirPumpUndersized(401)).toBe(true);
    expect(isAirPumpUndersized(1000)).toBe(true);
  });

  it('returns false at exactly max capacity', () => {
    expect(isAirPumpUndersized(400)).toBe(false);
  });
});
