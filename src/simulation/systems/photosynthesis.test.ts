import { describe, it, expect } from 'vitest';
import {
  calculateCo2Factor,
  calculateNitrateFactor,
  calculatePhotosynthesis,
  getTotalPlantSize,
} from './photosynthesis.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults, getNutrientRatio } from '../config/nutrients.js';
import type { Plant, Resources, PlantSpecies } from '../state.js';

/**
 * Build a resources snapshot with nutrient mass chosen so that concentration
 * (ppm) hits the given optimality-fraction for each nutrient. Used to set up
 * deterministic Liebig sufficiency across all four nutrients.
 */
function buildResources(
  waterVolume: number,
  overrides: Partial<Resources> = {},
  nutrientMultiple = 1.0
): Resources {
  return {
    water: waterVolume,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    aeration: false,
    food: 0,
    waste: 0,
    algae: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: nutrientsDefaults.optimalNitratePpm * waterVolume * nutrientMultiple,
    phosphate: nutrientsDefaults.optimalPhosphatePpm * waterVolume * nutrientMultiple,
    potassium: nutrientsDefaults.optimalPotassiumPpm * waterVolume * nutrientMultiple,
    iron: nutrientsDefaults.optimalIronPpm * waterVolume * nutrientMultiple,
    oxygen: 8,
    co2: plantsDefaults.optimalCo2,
    ph: 7,
    aob: 0,
    nob: 0,
    ...overrides,
  };
}

/**
 * Make a single plant of given size / species.
 */
function plant(size: number, species: PlantSpecies = 'amazon_sword'): Plant {
  return {
    id: `p-${species}-${size}`,
    species,
    size,
    condition: 100,
  };
}

describe('calculateCo2Factor', () => {
  it('returns 0 when CO2 is 0', () => {
    const factor = calculateCo2Factor(0);
    expect(factor).toBe(0);
  });

  it('returns 0 when CO2 is negative', () => {
    const factor = calculateCo2Factor(-5);
    expect(factor).toBe(0);
  });

  it('returns 1.0 at optimal CO2 level', () => {
    const factor = calculateCo2Factor(plantsDefaults.optimalCo2);
    expect(factor).toBe(1.0);
  });

  it('returns 0.5 at half of optimal CO2', () => {
    const factor = calculateCo2Factor(plantsDefaults.optimalCo2 / 2);
    expect(factor).toBe(0.5);
  });

  it('caps at 1.0 when CO2 exceeds optimal', () => {
    const factor = calculateCo2Factor(plantsDefaults.optimalCo2 * 2);
    expect(factor).toBe(1.0);
  });

  it('scales linearly between 0 and optimal', () => {
    const factor1 = calculateCo2Factor(4);
    const factor2 = calculateCo2Factor(8);
    expect(factor2).toBeCloseTo(factor1 * 2, 6);
  });

  it('uses custom config when provided', () => {
    const customConfig = { ...plantsDefaults, optimalCo2: 10 };
    expect(calculateCo2Factor(10, customConfig)).toBe(1.0);
  });
});

describe('calculateNitrateFactor', () => {
  it('returns 1.0 at optimal nitrate concentration', () => {
    const nitrateMass = plantsDefaults.optimalNitrate * 100;
    expect(calculateNitrateFactor(nitrateMass, 100)).toBe(1.0);
  });

  it('returns 0 when water volume is 0', () => {
    expect(calculateNitrateFactor(100, 0)).toBe(0);
  });

  it('scales linearly below optimal', () => {
    const f = calculateNitrateFactor(plantsDefaults.optimalNitrate * 50, 100);
    expect(f).toBe(0.5);
  });
});

describe('calculatePhotosynthesis', () => {
  const waterVolume = 100;
  const light = 50;

  describe('no photosynthesis conditions', () => {
    it('returns zeros when light is 0', () => {
      const result = calculatePhotosynthesis(
        [plant(100)],
        0,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.oxygenDelta).toBe(0);
      expect(result.nitrateDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('returns zeros when plant size is 0', () => {
      const result = calculatePhotosynthesis(
        [plant(0)],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when there are no plants', () => {
      const result = calculatePhotosynthesis(
        [],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when water volume is 0', () => {
      const result = calculatePhotosynthesis(
        [plant(100)],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        0
      );
      expect(result.oxygenDelta).toBe(0);
      expect(result.biomassProduced).toBe(0);
    });

    it('returns zeros when CO2 is 0', () => {
      const result = calculatePhotosynthesis(
        [plant(100)],
        light,
        0,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.biomassProduced).toBe(0);
      expect(result.oxygenDelta).toBe(0);
    });
  });

  describe('optimal conditions', () => {
    it('produces oxygen and consumes CO2 / nutrients', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.oxygenDelta).toBeGreaterThan(0);
      expect(result.co2Delta).toBeLessThan(0);
      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBeLessThan(0);
      expect(result.biomassProduced).toBeGreaterThan(0);
    });

    it('limiting factor is 1.0 at optimal conditions for low-demand plant', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.limitingFactor).toBeCloseTo(1.0, 3);
    });
  });

  describe("Liebig's Law - nutrient gating of biomass", () => {
    it('drops biomass to zero when iron is zero for a high-demand plant', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'monte_carlo')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume, { iron: 0 }),
        waterVolume
      );
      expect(result.biomassProduced).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('does NOT zero nutrient uptake when iron is zero (plants still draw)', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'monte_carlo')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume, { iron: 0 }),
        waterVolume
      );
      // Biomass is zero, but uptake draws from available pools. NO3 / PO4 / K
      // all have mass in resources and should be consumed.
      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBe(0); // clamped to available (0)
    });

    it('nutrient uptake splits in fertilizer ratio', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'amazon_sword')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume, {}, 10), // abundant supply, no clamping
        waterVolume
      );
      // Total negative uptake should split by fertilizer ratio
      const total =
        -result.nitrateDelta +
        -result.phosphateDelta +
        -result.potassiumDelta +
        -result.ironDelta;
      const formula = nutrientsDefaults.fertilizerFormula;
      expect(-result.nitrateDelta / total).toBeCloseTo(getNutrientRatio('nitrate', formula), 4);
      expect(-result.ironDelta / total).toBeCloseTo(getNutrientRatio('iron', formula), 4);
    });

    it('CO2 limit halves biomass at 50% optimal CO2', () => {
      const full = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      const half = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2 / 2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(half.biomassProduced).toBeCloseTo(full.biomassProduced / 2, 4);
      expect(half.oxygenDelta).toBeCloseTo(full.oxygenDelta / 2, 4);
    });
  });

  describe('scaling with plant size', () => {
    it('biomass scales linearly with plant size', () => {
      const r100 = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      const r200 = calculatePhotosynthesis(
        [plant(200, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume, {}, 10),
        waterVolume
      );
      expect(r200.biomassProduced).toBeCloseTo(r100.biomassProduced * 2, 4);
      expect(r200.oxygenDelta).toBeCloseTo(r100.oxygenDelta * 2, 4);
    });

    it('sums contributions from multiple plants', () => {
      const solo = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      const pair = calculatePhotosynthesis(
        [plant(50, 'java_fern'), plant(50, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(pair.biomassProduced).toBeCloseTo(solo.biomassProduced, 4);
    });
  });

  describe('calibration', () => {
    // Scenario 02: at 100% plant size, optimal CO2, low-demand plant at optimal
    // nutrients → biomass rate 1.0/hr → O2 delta 0.7 mg/L/hr.
    it('produces ~0.7 mg/L O2/hr at 100% plant size, optimal conditions', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.oxygenDelta).toBeCloseTo(0.7, 1);
    });

    it('consumes ~0.5 mg/L CO2/hr at 100% plant size, optimal conditions', () => {
      const result = calculatePhotosynthesis(
        [plant(100, 'java_fern')],
        light,
        plantsDefaults.optimalCo2,
        buildResources(waterVolume),
        waterVolume
      );
      expect(result.co2Delta).toBeCloseTo(-0.5, 1);
    });
  });
});

describe('getTotalPlantSize', () => {
  it('returns 0 for empty array', () => {
    expect(getTotalPlantSize([])).toBe(0);
  });

  it('returns size of single plant', () => {
    expect(getTotalPlantSize([{ size: 75 }])).toBe(75);
  });

  it('sums sizes of multiple plants', () => {
    expect(getTotalPlantSize([{ size: 50 }, { size: 75 }, { size: 100 }])).toBe(225);
  });

  it('handles plants with 0 size', () => {
    expect(getTotalPlantSize([{ size: 0 }, { size: 50 }])).toBe(50);
  });

  it('handles fractional sizes', () => {
    expect(getTotalPlantSize([{ size: 33.33 }, { size: 66.67 }])).toBe(100);
  });
});
