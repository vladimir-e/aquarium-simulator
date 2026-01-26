import { describe, it, expect } from 'vitest';
import {
  getRespirationTemperatureFactor,
  calculateRespiration,
} from './respiration.js';
import { plantsDefaults } from '../config/plants.js';

describe('getRespirationTemperatureFactor', () => {
  it('returns 1.0 at reference temperature (25C)', () => {
    const factor = getRespirationTemperatureFactor(plantsDefaults.respirationReferenceTemp);
    expect(factor).toBeCloseTo(1.0, 6);
  });

  it('returns 2.0 at 35C (Q10 = 2, +10C)', () => {
    const factor = getRespirationTemperatureFactor(35);
    expect(factor).toBeCloseTo(2.0, 6);
  });

  it('returns 0.5 at 15C (Q10 = 2, -10C)', () => {
    const factor = getRespirationTemperatureFactor(15);
    expect(factor).toBeCloseTo(0.5, 6);
  });

  it('returns ~1.41 (sqrt(2)) at 30C (+5C)', () => {
    const factor = getRespirationTemperatureFactor(30);
    // Q10^(5/10) = 2^0.5 = sqrt(2) ≈ 1.414
    expect(factor).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('returns ~0.71 (1/sqrt(2)) at 20C (-5C)', () => {
    const factor = getRespirationTemperatureFactor(20);
    // Q10^(-5/10) = 2^-0.5 = 1/sqrt(2) ≈ 0.707
    expect(factor).toBeCloseTo(1 / Math.sqrt(2), 4);
  });

  it('returns 4.0 at 45C (two doublings, +20C)', () => {
    const factor = getRespirationTemperatureFactor(45);
    expect(factor).toBeCloseTo(4.0, 6);
  });

  it('returns 0.25 at 5C (two halvings, -20C)', () => {
    const factor = getRespirationTemperatureFactor(5);
    expect(factor).toBeCloseTo(0.25, 6);
  });

  it('returns 8.0 at 55C (three doublings, +30C)', () => {
    const factor = getRespirationTemperatureFactor(55);
    expect(factor).toBeCloseTo(8.0, 6);
  });

  it('handles temperatures below zero', () => {
    const factor = getRespirationTemperatureFactor(-5);
    // Q10^(-30/10) = 2^-3 = 0.125
    expect(factor).toBeCloseTo(0.125, 6);
  });

  it('uses custom config reference temp', () => {
    const customConfig = { ...plantsDefaults, respirationReferenceTemp: 20 };
    const factor = getRespirationTemperatureFactor(20, customConfig);
    expect(factor).toBeCloseTo(1.0, 6);
  });

  it('uses custom config Q10 value', () => {
    const customConfig = { ...plantsDefaults, respirationQ10: 3 };
    // At +10C above reference with Q10=3, factor should be 3
    const factor = getRespirationTemperatureFactor(35, customConfig);
    expect(factor).toBeCloseTo(3.0, 6);
  });
});

describe('calculateRespiration', () => {
  describe('no respiration conditions', () => {
    it('returns zeros when plant size is 0', () => {
      const result = calculateRespiration(0, 25);

      expect(result.oxygenDelta).toBe(0);
      expect(result.co2Delta).toBe(0);
    });

    it('returns zeros when plant size is negative', () => {
      const result = calculateRespiration(-50, 25);

      expect(result.oxygenDelta).toBe(0);
      expect(result.co2Delta).toBe(0);
    });
  });

  describe('at reference temperature (25C)', () => {
    it('consumes oxygen (negative delta)', () => {
      const result = calculateRespiration(100, 25);
      expect(result.oxygenDelta).toBeLessThan(0);
    });

    it('produces CO2 (positive delta)', () => {
      const result = calculateRespiration(100, 25);
      expect(result.co2Delta).toBeGreaterThan(0);
    });

    it('O2 consumption and CO2 production are related by stoichiometry', () => {
      const result = calculateRespiration(100, 25);

      // Based on config: o2PerRespiration = 0.7, co2PerRespiration = 0.5
      // Ratio should be 0.7/0.5 = 1.4
      const ratio = Math.abs(result.oxygenDelta) / result.co2Delta;
      const expectedRatio = plantsDefaults.o2PerRespiration / plantsDefaults.co2PerRespiration;
      expect(ratio).toBeCloseTo(expectedRatio, 6);
    });
  });

  describe('scaling with plant size', () => {
    it('respiration scales linearly with plant size', () => {
      const result100 = calculateRespiration(100, 25);
      const result200 = calculateRespiration(200, 25);

      expect(result200.oxygenDelta).toBeCloseTo(result100.oxygenDelta * 2, 6);
      expect(result200.co2Delta).toBeCloseTo(result100.co2Delta * 2, 6);
    });

    it('handles fractional plant sizes', () => {
      const result50 = calculateRespiration(50, 25);
      const result100 = calculateRespiration(100, 25);

      expect(result50.oxygenDelta).toBeCloseTo(result100.oxygenDelta / 2, 6);
      expect(result50.co2Delta).toBeCloseTo(result100.co2Delta / 2, 6);
    });

    it('handles very small plant sizes', () => {
      const result = calculateRespiration(1, 25);

      expect(result.oxygenDelta).toBeLessThan(0);
      expect(result.co2Delta).toBeGreaterThan(0);
    });

    it('handles very large plant sizes', () => {
      const result = calculateRespiration(500, 25);

      expect(result.oxygenDelta).toBeLessThan(0);
      expect(result.co2Delta).toBeGreaterThan(0);
    });
  });

  describe('temperature effects', () => {
    it('respiration doubles at +10C (35C vs 25C)', () => {
      const result25 = calculateRespiration(100, 25);
      const result35 = calculateRespiration(100, 35);

      expect(result35.oxygenDelta).toBeCloseTo(result25.oxygenDelta * 2, 6);
      expect(result35.co2Delta).toBeCloseTo(result25.co2Delta * 2, 6);
    });

    it('respiration halves at -10C (15C vs 25C)', () => {
      const result25 = calculateRespiration(100, 25);
      const result15 = calculateRespiration(100, 15);

      expect(result15.oxygenDelta).toBeCloseTo(result25.oxygenDelta / 2, 6);
      expect(result15.co2Delta).toBeCloseTo(result25.co2Delta / 2, 6);
    });

    it('higher temperatures increase respiration rate', () => {
      const resultCold = calculateRespiration(100, 20);
      const resultWarm = calculateRespiration(100, 30);

      // More O2 consumed at higher temp (more negative)
      expect(resultWarm.oxygenDelta).toBeLessThan(resultCold.oxygenDelta);
      // More CO2 produced at higher temp
      expect(resultWarm.co2Delta).toBeGreaterThan(resultCold.co2Delta);
    });

    it('cold temperatures reduce respiration rate', () => {
      const resultCold = calculateRespiration(100, 10);
      const resultRef = calculateRespiration(100, 25);

      // Less O2 consumed at lower temp (less negative)
      expect(resultCold.oxygenDelta).toBeGreaterThan(resultRef.oxygenDelta);
      // Less CO2 produced at lower temp
      expect(resultCold.co2Delta).toBeLessThan(resultRef.co2Delta);
    });
  });

  describe('calibration', () => {
    it('respiration rate is ~15% of max photosynthesis at reference temp', () => {
      // At 100% plant size and reference temp
      const result = calculateRespiration(100, 25);

      // Based on config: baseRespirationRate = 0.15
      // O2 consumption = 0.15 * 0.7 = 0.105 mg/L
      const expectedO2 = -plantsDefaults.baseRespirationRate * plantsDefaults.o2PerRespiration;
      expect(result.oxygenDelta).toBeCloseTo(expectedO2, 6);

      // CO2 production = 0.15 * 0.5 = 0.075 mg/L
      const expectedCo2 = plantsDefaults.baseRespirationRate * plantsDefaults.co2PerRespiration;
      expect(result.co2Delta).toBeCloseTo(expectedCo2, 6);
    });
  });

  describe('uses custom config', () => {
    it('respects custom base respiration rate', () => {
      const customConfig = { ...plantsDefaults, baseRespirationRate: 0.3 };
      const defaultResult = calculateRespiration(100, 25, plantsDefaults);
      const customResult = calculateRespiration(100, 25, customConfig);

      // Custom should be 2x default (0.3 vs 0.15)
      expect(customResult.oxygenDelta).toBeCloseTo(defaultResult.oxygenDelta * 2, 6);
    });

    it('respects custom O2 per respiration', () => {
      const customConfig = { ...plantsDefaults, o2PerRespiration: 1.4 };
      const defaultResult = calculateRespiration(100, 25, plantsDefaults);
      const customResult = calculateRespiration(100, 25, customConfig);

      // Custom should be 2x O2 consumption (1.4 vs 0.7)
      expect(customResult.oxygenDelta).toBeCloseTo(defaultResult.oxygenDelta * 2, 6);
    });

    it('respects custom CO2 per respiration', () => {
      const customConfig = { ...plantsDefaults, co2PerRespiration: 1.0 };
      const defaultResult = calculateRespiration(100, 25, plantsDefaults);
      const customResult = calculateRespiration(100, 25, customConfig);

      // Custom should be 2x CO2 production (1.0 vs 0.5)
      expect(customResult.co2Delta).toBeCloseTo(defaultResult.co2Delta * 2, 6);
    });
  });
});
