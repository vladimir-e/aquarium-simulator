import { describe, it, expect } from 'vitest';
import {
  calculateCo2Factor,
  calculateNitrateFactor,
  calculatePhotosynthesis,
  getTotalPlantSize,
} from './photosynthesis.js';
import { plantsDefaults } from '../config/plants.js';

describe('calculateCo2Factor', () => {
  it('returns 0 when CO2 is 0', () => {
    const factor = calculateCo2Factor(0);
    expect(factor).toBe(0);
  });

  it('returns 0 when CO2 is negative', () => {
    const factor = calculateCo2Factor(-5);
    expect(factor).toBe(0);
  });

  it('returns 1.0 at optimal CO2 level (20 mg/L)', () => {
    const factor = calculateCo2Factor(plantsDefaults.optimalCo2);
    expect(factor).toBe(1.0);
  });

  it('returns 0.5 at half of optimal CO2 (10 mg/L)', () => {
    const factor = calculateCo2Factor(plantsDefaults.optimalCo2 / 2);
    expect(factor).toBe(0.5);
  });

  it('returns 0.25 at quarter of optimal CO2 (5 mg/L)', () => {
    const factor = calculateCo2Factor(5);
    expect(factor).toBe(0.25);
  });

  it('caps at 1.0 when CO2 exceeds optimal', () => {
    const factor = calculateCo2Factor(40); // 2x optimal
    expect(factor).toBe(1.0);
  });

  it('scales linearly between 0 and optimal', () => {
    const factor1 = calculateCo2Factor(4);
    const factor2 = calculateCo2Factor(8);
    // Factor2 should be 2x factor1
    expect(factor2).toBeCloseTo(factor1 * 2, 6);
  });

  it('uses custom config when provided', () => {
    const customConfig = { ...plantsDefaults, optimalCo2: 10 };
    const factor = calculateCo2Factor(10, customConfig);
    expect(factor).toBe(1.0);
  });
});

describe('calculateNitrateFactor', () => {
  it('returns 0 when nitrate mass is 0', () => {
    const factor = calculateNitrateFactor(0, 100);
    expect(factor).toBe(0);
  });

  it('returns 0 when nitrate mass is negative', () => {
    const factor = calculateNitrateFactor(-10, 100);
    expect(factor).toBe(0);
  });

  it('returns 0 when water volume is 0', () => {
    const factor = calculateNitrateFactor(100, 0);
    expect(factor).toBe(0);
  });

  it('returns 0 when water volume is negative', () => {
    const factor = calculateNitrateFactor(100, -50);
    expect(factor).toBe(0);
  });

  it('returns 1.0 at optimal nitrate concentration (10 ppm)', () => {
    // 10 ppm = 10 mg per liter, so 1000 mg in 100L tank
    const nitrateMass = plantsDefaults.optimalNitrate * 100; // 1000 mg
    const factor = calculateNitrateFactor(nitrateMass, 100);
    expect(factor).toBe(1.0);
  });

  it('returns 0.5 at half of optimal nitrate (5 ppm)', () => {
    // 5 ppm = 500 mg in 100L tank
    const nitrateMass = (plantsDefaults.optimalNitrate / 2) * 100;
    const factor = calculateNitrateFactor(nitrateMass, 100);
    expect(factor).toBe(0.5);
  });

  it('caps at 1.0 when nitrate exceeds optimal', () => {
    // 20 ppm = 2000 mg in 100L tank
    const nitrateMass = plantsDefaults.optimalNitrate * 2 * 100;
    const factor = calculateNitrateFactor(nitrateMass, 100);
    expect(factor).toBe(1.0);
  });

  it('converts mass to ppm correctly for different volumes', () => {
    // 10 ppm in 50L tank = 500 mg
    const factor50L = calculateNitrateFactor(500, 50);
    // 10 ppm in 200L tank = 2000 mg
    const factor200L = calculateNitrateFactor(2000, 200);
    // Both should be 1.0 (at optimal)
    expect(factor50L).toBe(1.0);
    expect(factor200L).toBe(1.0);
  });

  it('uses custom config when provided', () => {
    const customConfig = { ...plantsDefaults, optimalNitrate: 5 };
    // 5 ppm in 100L = 500 mg
    const factor = calculateNitrateFactor(500, 100, customConfig);
    expect(factor).toBe(1.0);
  });
});

describe('calculatePhotosynthesis', () => {
  const defaultParams = {
    totalPlantSize: 100, // 100%
    light: 50, // watts
    co2: plantsDefaults.optimalCo2, // optimal
    nitrateMass: plantsDefaults.optimalNitrate * 100, // optimal in 100L
    waterVolume: 100,
  };

  describe('no photosynthesis conditions', () => {
    it('returns zeros when light is 0', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        0, // no light
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.co2Delta).toBe(0);
      expect(result.nitrateDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('returns zeros when light is negative', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        -10,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when plant size is 0', () => {
      const result = calculatePhotosynthesis(
        0,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when plant size is negative', () => {
      const result = calculatePhotosynthesis(
        -50,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when water volume is 0', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        0
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when water volume is negative', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        -100
      );

      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });
  });

  describe('optimal conditions', () => {
    it('produces oxygen at optimal conditions', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.oxygenDelta).toBeGreaterThan(0);
    });

    it('consumes CO2 at optimal conditions (negative delta)', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.co2Delta).toBeLessThan(0);
    });

    it('consumes nitrate at optimal conditions (negative delta)', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.nitrateDelta).toBeLessThan(0);
    });

    it('produces biomass at optimal conditions', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.biomassProduced).toBeGreaterThan(0);
    });

    it('limiting factor is 1.0 at optimal conditions', () => {
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result.limitingFactor).toBe(1.0);
    });
  });

  describe('Liebigs Law - limiting factor selection', () => {
    it('uses CO2 factor when CO2 is more limiting than nitrate', () => {
      // Low CO2, optimal nitrate
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        plantsDefaults.optimalCo2 / 4, // 25% CO2
        defaultParams.nitrateMass, // optimal nitrate
        defaultParams.waterVolume
      );

      expect(result.limitingFactor).toBe(0.25);
    });

    it('uses nitrate factor when nitrate is more limiting than CO2', () => {
      // Optimal CO2, low nitrate
      const lowNitrate = (plantsDefaults.optimalNitrate / 4) * 100; // 25% of optimal in 100L
      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2, // optimal CO2
        lowNitrate,
        defaultParams.waterVolume
      );

      expect(result.limitingFactor).toBe(0.25);
    });

    it('uses minimum of both factors when both are limiting', () => {
      // 50% CO2, 30% nitrate -> should use 30%
      const lowCo2 = plantsDefaults.optimalCo2 / 2; // 50%
      const lowNitrate = (plantsDefaults.optimalNitrate * 0.3) * 100; // 30%

      const result = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        lowCo2,
        lowNitrate,
        defaultParams.waterVolume
      );

      expect(result.limitingFactor).toBeCloseTo(0.3, 6);
    });

    it('limiting factor reduces all outputs proportionally', () => {
      // Full output at optimal
      const fullResult = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      // Half output at 50% limiting factor
      const halfResult = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        plantsDefaults.optimalCo2 / 2, // 50% CO2
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(halfResult.oxygenDelta).toBeCloseTo(fullResult.oxygenDelta / 2, 6);
      expect(halfResult.co2Delta).toBeCloseTo(fullResult.co2Delta / 2, 6);
      expect(halfResult.biomassProduced).toBeCloseTo(fullResult.biomassProduced / 2, 6);
    });
  });

  describe('scaling with plant size', () => {
    it('scales linearly with plant size', () => {
      const result100 = calculatePhotosynthesis(
        100,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      const result200 = calculatePhotosynthesis(
        200,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result200.oxygenDelta).toBeCloseTo(result100.oxygenDelta * 2, 6);
      expect(result200.biomassProduced).toBeCloseTo(result100.biomassProduced * 2, 6);
    });

    it('handles fractional plant sizes', () => {
      const result50 = calculatePhotosynthesis(
        50,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      const result100 = calculatePhotosynthesis(
        100,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      expect(result50.oxygenDelta).toBeCloseTo(result100.oxygenDelta / 2, 6);
    });
  });

  describe('nitrate consumption scaling', () => {
    it('nitrate consumption scales with water volume', () => {
      const result100L = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        100
      );

      const result200L = calculatePhotosynthesis(
        defaultParams.totalPlantSize,
        defaultParams.light,
        defaultParams.co2,
        plantsDefaults.optimalNitrate * 200, // Optimal in 200L
        200
      );

      // Same conditions, but 2x the water volume = 2x nitrate consumption
      expect(result200L.nitrateDelta).toBeCloseTo(result100L.nitrateDelta * 2, 6);
    });
  });

  describe('calibration', () => {
    it('produces ~0.7 mg/L O2/hr at 100% plant size, optimal conditions', () => {
      const result = calculatePhotosynthesis(
        100,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      // Based on config: basePhotosynthesisRate * o2PerPhotosynthesis = 1.0 * 0.7 = 0.7
      expect(result.oxygenDelta).toBeCloseTo(0.7, 1);
    });

    it('consumes ~0.5 mg/L CO2/hr at 100% plant size, optimal conditions', () => {
      const result = calculatePhotosynthesis(
        100,
        defaultParams.light,
        defaultParams.co2,
        defaultParams.nitrateMass,
        defaultParams.waterVolume
      );

      // Based on config: basePhotosynthesisRate * co2PerPhotosynthesis = 1.0 * 0.5 = 0.5
      expect(result.co2Delta).toBeCloseTo(-0.5, 1);
    });
  });
});

describe('getTotalPlantSize', () => {
  it('returns 0 for empty array', () => {
    const total = getTotalPlantSize([]);
    expect(total).toBe(0);
  });

  it('returns size of single plant', () => {
    const plants = [{ size: 75 }];
    const total = getTotalPlantSize(plants);
    expect(total).toBe(75);
  });

  it('sums sizes of multiple plants', () => {
    const plants = [{ size: 50 }, { size: 75 }, { size: 100 }];
    const total = getTotalPlantSize(plants);
    expect(total).toBe(225);
  });

  it('handles plants with 0 size', () => {
    const plants = [{ size: 0 }, { size: 50 }];
    const total = getTotalPlantSize(plants);
    expect(total).toBe(50);
  });

  it('handles plants with fractional sizes', () => {
    const plants = [{ size: 33.33 }, { size: 66.67 }];
    const total = getTotalPlantSize(plants);
    expect(total).toBe(100);
  });

  it('handles large number of plants', () => {
    const plants = Array(100).fill({ size: 1 });
    const total = getTotalPlantSize(plants);
    expect(total).toBe(100);
  });
});
