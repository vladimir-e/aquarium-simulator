import { describe, it, expect } from 'vitest';
import {
  getRespirationTemperatureFactor,
  calculateRespiration,
} from './respiration.js';
import { plantsDefaults } from '../config/plants.js';
import { AIR_SATURATED_O2 } from '../config/nitrogen-cycle.js';
import { CO2_TO_O2_MASS_RATIO, MW_CO2, MW_O2 } from '../core/chemistry.js';
import { monodFactor } from '../core/kinetics.js';

describe('getRespirationTemperatureFactor', () => {
  const { respirationQ10: q10, respirationReferenceTemp: ref } = plantsDefaults;

  it('is 1 at the reference temperature and q10 per 10 °C either way', () => {
    expect(getRespirationTemperatureFactor(ref)).toBeCloseTo(1, 10);
    expect(getRespirationTemperatureFactor(ref + 10)).toBeCloseTo(q10, 10);
    expect(getRespirationTemperatureFactor(ref - 30)).toBeCloseTo(q10 ** -3, 10);
  });

  it('reads the reference and q10 off the config', () => {
    const custom = { ...plantsDefaults, respirationReferenceTemp: 20, respirationQ10: 3 };
    expect(getRespirationTemperatureFactor(20, custom)).toBeCloseTo(1, 10);
    expect(getRespirationTemperatureFactor(30, custom)).toBeCloseTo(3, 10);
  });
});

describe('calculateRespiration', () => {
  describe('no respiration conditions', () => {
    it('returns zeros when plant size is 0', () => {
      const result = calculateRespiration(0, 25, AIR_SATURATED_O2);

      expect(result.oxygenConsumedMg).toBe(0);
      expect(result.co2ProducedMg).toBe(0);
    });
  });

  describe('stoichiometry', () => {
    it('burns one mole of O2 for every mole of carbon it releases', () => {
      const result = calculateRespiration(100, 25, AIR_SATURATED_O2);

      expect(result.oxygenConsumedMg / MW_O2).toBeCloseTo(result.co2ProducedMg / MW_CO2, 10);
    });
  });

  describe('scaling with plant size', () => {
    it('respiration scales linearly with plant size', () => {
      const result100 = calculateRespiration(100, 25, AIR_SATURATED_O2);
      const result200 = calculateRespiration(200, 25, AIR_SATURATED_O2);

      expect(result200.oxygenConsumedMg).toBeCloseTo(result100.oxygenConsumedMg * 2, 6);
      expect(result200.co2ProducedMg).toBeCloseTo(result100.co2ProducedMg * 2, 6);
    });
  });

  describe('temperature effects', () => {
    it('runs q10 faster ten degrees warmer', () => {
      const result25 = calculateRespiration(100, 25, AIR_SATURATED_O2);
      const result35 = calculateRespiration(100, 35, AIR_SATURATED_O2);
      const { respirationQ10 } = plantsDefaults;

      expect(result35.oxygenConsumedMg).toBeCloseTo(result25.oxygenConsumedMg * respirationQ10, 6);
      expect(result35.co2ProducedMg).toBeCloseTo(result25.co2ProducedMg * respirationQ10, 6);
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

  describe('the rate', () => {
    it('releases the configured carbon per unit at 100 % size and reference temp', () => {
      const result = calculateRespiration(100, 25, AIR_SATURATED_O2);

      const expectedCo2 =
        plantsDefaults.baseRespirationRate *
        plantsDefaults.co2PerRateUnit *
        monodFactor(AIR_SATURATED_O2, plantsDefaults.respirationOxygenHalfSaturation);
      expect(result.co2ProducedMg).toBeCloseTo(expectedCo2, 6);
      expect(result.oxygenConsumedMg).toBeCloseTo(expectedCo2 * CO2_TO_O2_MASS_RATIO, 6);
    });
  });

  describe('uses custom config', () => {
    it('respects custom base respiration rate', () => {
      const customConfig = {
        ...plantsDefaults,
        baseRespirationRate: plantsDefaults.baseRespirationRate * 2,
      };
      const defaultResult = calculateRespiration(100, 25, AIR_SATURATED_O2, plantsDefaults);
      const customResult = calculateRespiration(100, 25, AIR_SATURATED_O2, customConfig);

      expect(customResult.oxygenConsumedMg).toBeCloseTo(defaultResult.oxygenConsumedMg * 2, 6);
    });

    it('moves both gases together when the carbon yield changes', () => {
      const customConfig = { ...plantsDefaults, co2PerRateUnit: plantsDefaults.co2PerRateUnit * 2 };
      const defaultResult = calculateRespiration(100, 25, AIR_SATURATED_O2, plantsDefaults);
      const customResult = calculateRespiration(100, 25, AIR_SATURATED_O2, customConfig);

      expect(customResult.co2ProducedMg).toBeCloseTo(defaultResult.co2ProducedMg * 2, 6);
      expect(customResult.oxygenConsumedMg).toBeCloseTo(defaultResult.oxygenConsumedMg * 2, 6);
    });
  });
});
