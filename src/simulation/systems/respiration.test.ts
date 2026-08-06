import { describe, it, expect } from 'vitest';
import {
  getRespirationTemperatureFactor,
  calculateRespiration,
} from './respiration.js';
import { plantsDefaults } from '../config/plants.js';
import { CO2_TO_O2_MASS_RATIO, MW_CO2, MW_O2 } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';

/** Air-saturated water at 25 °C, where nothing here is oxygen-limited. */
const SATURATED_O2 = 8;

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
      const result = calculateRespiration(0, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg).toBe(0);
      expect(result.co2ProducedMg).toBe(0);
    });

    it('returns zeros when plant size is negative', () => {
      const result = calculateRespiration(-50, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg).toBe(0);
      expect(result.co2ProducedMg).toBe(0);
    });
  });

  describe('at reference temperature (25C)', () => {
    it('consumes oxygen and produces CO2', () => {
      const result = calculateRespiration(100, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg).toBeGreaterThan(0);
      expect(result.co2ProducedMg).toBeGreaterThan(0);
    });

    it('burns one mole of O2 for every mole of carbon it releases', () => {
      const result = calculateRespiration(100, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg / MW_O2).toBeCloseTo(result.co2ProducedMg / MW_CO2, 10);
    });
  });

  describe('scaling with plant size', () => {
    it('respiration scales linearly with plant size', () => {
      const result100 = calculateRespiration(100, 25, SATURATED_O2);
      const result200 = calculateRespiration(200, 25, SATURATED_O2);

      expect(result200.oxygenConsumedMg).toBeCloseTo(result100.oxygenConsumedMg * 2, 6);
      expect(result200.co2ProducedMg).toBeCloseTo(result100.co2ProducedMg * 2, 6);
    });

    it('handles fractional plant sizes', () => {
      const result50 = calculateRespiration(50, 25, SATURATED_O2);
      const result100 = calculateRespiration(100, 25, SATURATED_O2);

      expect(result50.oxygenConsumedMg).toBeCloseTo(result100.oxygenConsumedMg / 2, 6);
      expect(result50.co2ProducedMg).toBeCloseTo(result100.co2ProducedMg / 2, 6);
    });

    it('handles very small plant sizes', () => {
      const result = calculateRespiration(1, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg).toBeGreaterThan(0);
      expect(result.co2ProducedMg).toBeGreaterThan(0);
    });

    it('handles very large plant sizes', () => {
      const result = calculateRespiration(500, 25, SATURATED_O2);

      expect(result.oxygenConsumedMg).toBeGreaterThan(0);
      expect(result.co2ProducedMg).toBeGreaterThan(0);
    });
  });

  describe('temperature effects', () => {
    it('respiration doubles at +10C (35C vs 25C)', () => {
      const result25 = calculateRespiration(100, 25, SATURATED_O2);
      const result35 = calculateRespiration(100, 35, SATURATED_O2);

      expect(result35.oxygenConsumedMg).toBeCloseTo(result25.oxygenConsumedMg * 2, 6);
      expect(result35.co2ProducedMg).toBeCloseTo(result25.co2ProducedMg * 2, 6);
    });

    it('respiration halves at -10C (15C vs 25C)', () => {
      const result25 = calculateRespiration(100, 25, SATURATED_O2);
      const result15 = calculateRespiration(100, 15, SATURATED_O2);

      expect(result15.oxygenConsumedMg).toBeCloseTo(result25.oxygenConsumedMg / 2, 6);
      expect(result15.co2ProducedMg).toBeCloseTo(result25.co2ProducedMg / 2, 6);
    });

    it('higher temperatures increase respiration rate', () => {
      const resultCold = calculateRespiration(100, 20, SATURATED_O2);
      const resultWarm = calculateRespiration(100, 30, SATURATED_O2);

      expect(resultWarm.oxygenConsumedMg).toBeGreaterThan(resultCold.oxygenConsumedMg);
      expect(resultWarm.co2ProducedMg).toBeGreaterThan(resultCold.co2ProducedMg);
    });

    it('cold temperatures reduce respiration rate', () => {
      const resultCold = calculateRespiration(100, 10, SATURATED_O2);
      const resultRef = calculateRespiration(100, 25, SATURATED_O2);

      expect(resultCold.oxygenConsumedMg).toBeLessThan(resultRef.oxygenConsumedMg);
      expect(resultCold.co2ProducedMg).toBeLessThan(resultRef.co2ProducedMg);
    });
  });

  describe('oxygen availability', () => {
    it('runs at half its base rate at the half-saturation constant', () => {
      const half = calculateRespiration(100, 25, plantsDefaults.respirationOxygenHalfSaturation);

      expect(half.co2ProducedMg).toBeCloseTo(
        plantsDefaults.baseRespirationRate * plantsDefaults.co2PerRateUnit * 0.5,
        9
      );
    });

    it('draws nothing at all from water with no oxygen in it', () => {
      const result = calculateRespiration(100, 25, 0);

      expect(result.oxygenConsumedMg).toBe(0);
      expect(result.co2ProducedMg).toBe(0);
    });

    it('falls monotonically as the water empties, and never below zero', () => {
      let previous = Infinity;
      for (const oxygen of [8, 4, 2, 1, 0.5, 0.25, 0.1, 0]) {
        const drawn = calculateRespiration(100, 25, oxygen).oxygenConsumedMg;
        expect(drawn).toBeGreaterThanOrEqual(0);
        expect(drawn).toBeLessThan(previous);
        previous = drawn;
      }
    });

    it('carries the carbon down with the oxygen, so the moles still match', () => {
      const result = calculateRespiration(100, 25, 0.2);

      expect(result.oxygenConsumedMg / MW_O2).toBeCloseTo(result.co2ProducedMg / MW_CO2, 12);
    });
  });

  describe('calibration', () => {
    it('releases the configured carbon per unit at 100 % size and reference temp', () => {
      const result = calculateRespiration(100, 25, SATURATED_O2);

      const expectedCo2 =
        plantsDefaults.baseRespirationRate *
        plantsDefaults.co2PerRateUnit *
        monodFactor(SATURATED_O2, plantsDefaults.respirationOxygenHalfSaturation);
      expect(result.co2ProducedMg).toBeCloseTo(expectedCo2, 6);
      expect(result.oxygenConsumedMg).toBeCloseTo(expectedCo2 * CO2_TO_O2_MASS_RATIO, 6);
    });

    it('differs from photosynthesis by the base rates and the air it breathes', () => {
      const respired = calculateRespiration(100, 25, SATURATED_O2).co2ProducedMg;
      const fixed = plantsDefaults.basePhotosynthesisRate * plantsDefaults.co2PerRateUnit;

      expect(respired / fixed).toBeCloseTo(
        (plantsDefaults.baseRespirationRate / plantsDefaults.basePhotosynthesisRate) *
          monodFactor(SATURATED_O2, plantsDefaults.respirationOxygenHalfSaturation),
        6
      );
    });
  });

  describe('uses custom config', () => {
    it('respects custom base respiration rate', () => {
      const customConfig = { ...plantsDefaults, baseRespirationRate: 0.3 };
      const defaultResult = calculateRespiration(100, 25, SATURATED_O2, plantsDefaults);
      const customResult = calculateRespiration(100, 25, SATURATED_O2, customConfig);

      // Custom should be 2x default (0.3 vs 0.15)
      expect(customResult.oxygenConsumedMg).toBeCloseTo(defaultResult.oxygenConsumedMg * 2, 6);
    });

    it('moves both gases together when the carbon yield changes', () => {
      const customConfig = { ...plantsDefaults, co2PerRateUnit: 60 };
      const defaultResult = calculateRespiration(100, 25, SATURATED_O2, plantsDefaults);
      const customResult = calculateRespiration(100, 25, SATURATED_O2, customConfig);

      expect(customResult.co2ProducedMg).toBeCloseTo(defaultResult.co2ProducedMg * 2, 6);
      expect(customResult.oxygenConsumedMg).toBeCloseTo(defaultResult.oxygenConsumedMg * 2, 6);
    });
  });
});
