import { describe, it, expect } from 'vitest';
import { getAirPumpOutput, getAirPumpFlow, isAirPumpUndersized, AIR_PUMP_SPEC } from './air-pump.js';

const CAPACITIES = [10, 30, 40, 41, 100, 150, 151, 300, 400, 401, 1000];

describe('getAirPumpOutput', () => {
  it('never shrinks as the tank grows', () => {
    const outputs = CAPACITIES.map(getAirPumpOutput);
    for (let i = 1; i < outputs.length; i++) expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]!);
    expect(outputs[0]).toBe(AIR_PUMP_SPEC.baseOutputLph);
  });
});

describe('getAirPumpFlow', () => {
  it('is the bubble uplift of the air output, in whole litres', () => {
    for (const capacity of CAPACITIES) {
      const flow = getAirPumpFlow(capacity);
      expect(Number.isInteger(flow)).toBe(true);
      expect(flow).toBe(Math.round(getAirPumpOutput(capacity) * AIR_PUMP_SPEC.flowPerAirLph));
    }
  });
});

describe('isAirPumpUndersized', () => {
  it('flags only tanks past the pump’s capacity', () => {
    const max = AIR_PUMP_SPEC.maxCapacityLiters;
    expect(isAirPumpUndersized(max / 2)).toBe(false);
    expect(isAirPumpUndersized(max)).toBe(false);
    expect(isAirPumpUndersized(max + 1)).toBe(true);
  });
});
