import { describe, it, expect } from 'vitest';
import {
  calculateCo2Factor,
  calculatePhotosynthesis,
  getTotalPlantSize,
  type PhotosynthesisResult,
} from './photosynthesis.js';
import { calculateNutrientSufficiency } from './nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults, getNutrientRatio } from '../config/nutrients.js';
import type { Plant, Resources } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { CO2_TO_O2_MASS_RATIO, MW_CO2, MW_O2 } from '../core/chemistry.js';

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

/**
 * Build a sufficiency map for a given plant set + resources, using the
 * production sufficiency function. The orchestrator does this once per
 * tick; tests do it inline so the calls match the new
 * `calculatePhotosynthesis` signature exactly.
 */
function suffMap(
  plants: readonly Plant[],
  resources: Resources,
  waterVolume: number
): Map<string, number> {
  return new Map(
    plants.map((p) => [
      p.id,
      calculateNutrientSufficiency(resources, waterVolume, p.species, nutrientsDefaults),
    ])
  );
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

describe('nitrate as the Liebig-limiting nutrient', () => {
  // Pin the per-plant Liebig sufficiency formula when nitrate is the only
  // nutrient short of optimum (the other three are saturated). Uses Monte
  // Carlo (high demand, all four nutrients required) so a missing nitrate
  // can fully express as sufficiency loss.
  const waterVolume = 100;
  const optimal = nutrientsDefaults.optimalNitratePpm;

  function buildSingleLimited(nitratePpm: number): Resources {
    return {
      ...buildResources(waterVolume),
      nitrate: nitratePpm * waterVolume,
    };
  }

  it('sufficiency = 1.0 at optimal nitrate', () => {
    const suff = calculateNutrientSufficiency(
      buildSingleLimited(optimal),
      waterVolume,
      'monte_carlo',
      nutrientsDefaults
    );
    expect(suff).toBe(1.0);
  });

  it('sufficiency = 0 when water volume is 0', () => {
    const suff = calculateNutrientSufficiency(
      buildSingleLimited(optimal),
      0,
      'monte_carlo',
      nutrientsDefaults
    );
    expect(suff).toBe(0);
  });

  it('sufficiency scales linearly with nitrate below optimal', () => {
    const suff = calculateNutrientSufficiency(
      buildSingleLimited(optimal * 0.5),
      waterVolume,
      'monte_carlo',
      nutrientsDefaults
    );
    expect(suff).toBe(0.5);
  });
});

describe('calculatePhotosynthesis', () => {
  const waterVolume = 100;
  const light = 50;

  /** Call with one plant set, its own sufficiency map, and the usual defaults. */
  function photosynthesis(
    plants: readonly Plant[],
    {
      co2 = plantsDefaults.optimalCo2,
      resources = buildResources(waterVolume),
      volume = waterVolume,
      lightPar = light,
    }: {
      co2?: number;
      resources?: Resources;
      volume?: number;
      lightPar?: number;
    } = {}
  ): PhotosynthesisResult {
    return calculatePhotosynthesis(
      plants,
      lightPar,
      co2,
      resources,
      volume,
      suffMap(plants, resources, volume)
    );
  }

  describe('no photosynthesis conditions', () => {
    it('returns zeros when light is 0', () => {
      const result = photosynthesis([plant(100)], { lightPar: 0 });

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.co2ConsumedMg).toBe(0);
      expect(result.nitrateDelta).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('returns zeros when plant size is 0', () => {
      const result = photosynthesis([plant(0)]);

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.co2ConsumedMg).toBe(0);
    });

    it('returns zeros when there are no plants', () => {
      const result = photosynthesis([]);

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.co2ConsumedMg).toBe(0);
    });

    it('returns zeros when water volume is 0', () => {
      const result = photosynthesis([plant(100)], { volume: 0 });

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.co2ConsumedMg).toBe(0);
    });

    it('returns zeros when CO2 is 0', () => {
      const result = photosynthesis([plant(100)], { co2: 0 });

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.co2ConsumedMg).toBe(0);
    });
  });

  describe('optimal conditions', () => {
    it('produces oxygen and consumes CO2 / nutrients', () => {
      const result = photosynthesis([plant(100, 'java_fern')]);

      expect(result.oxygenProducedMg).toBeGreaterThan(0);
      expect(result.co2ConsumedMg).toBeGreaterThan(0);
      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBeLessThan(0);
    });

    it('limiting factor is 1.0 at optimal conditions for low-demand plant', () => {
      const result = photosynthesis([plant(100, 'java_fern')]);

      expect(result.limitingFactor).toBeCloseTo(1.0, 3);
    });
  });

  describe('stoichiometry', () => {
    it('releases one mole of O2 per mole of carbon fixed', () => {
      const result = photosynthesis([plant(100, 'java_fern')]);

      expect(result.oxygenProducedMg / MW_O2).toBeCloseTo(result.co2ConsumedMg / MW_CO2, 10);
    });

    it('holds the ratio however the carbon yield is tuned', () => {
      const tuned = { ...plantsDefaults, co2PerPhotosynthesis: 7 };
      const plants = [plant(100, 'java_fern')];
      const resources = buildResources(waterVolume);
      const result = calculatePhotosynthesis(
        plants,
        light,
        plantsDefaults.optimalCo2,
        resources,
        waterVolume,
        suffMap(plants, resources, waterVolume),
        tuned
      );

      expect(result.oxygenProducedMg / MW_O2).toBeCloseTo(result.co2ConsumedMg / MW_CO2, 10);
    });

    it('makes no oxygen from carbon the water does not hold', () => {
      const starved = photosynthesis([plant(100, 'java_fern')], {
        co2: plantsDefaults.optimalCo2,
        resources: buildResources(waterVolume),
        volume: 0.001,
      });

      expect(starved.co2ConsumedMg).toBeCloseTo(plantsDefaults.optimalCo2 * 0.001, 10);
      expect(starved.oxygenProducedMg).toBeCloseTo(
        starved.co2ConsumedMg * CO2_TO_O2_MASS_RATIO,
        10
      );
    });
  });

  describe('the volume term', () => {
    it('moves the same gas mass whatever the tank around the plants', () => {
      const plants = [plant(100, 'java_fern')];
      const small = photosynthesis(plants, {
        resources: buildResources(150, {}, 10),
        volume: 150,
      });
      const large = photosynthesis(plants, {
        resources: buildResources(300, {}, 10),
        volume: 300,
      });

      expect(large.oxygenProducedMg).toBeCloseTo(small.oxygenProducedMg, 10);
      expect(large.co2ConsumedMg).toBeCloseTo(small.co2ConsumedMg, 10);
    });

    it('moves the concentration by the volume ratio', () => {
      const plants = [plant(100, 'java_fern')];
      const perLitre = (volume: number): number =>
        photosynthesis(plants, { resources: buildResources(volume, {}, 10), volume })
          .oxygenProducedMg / volume;

      expect(perLitre(150) / perLitre(300)).toBeCloseTo(2, 10);
    });
  });

  describe("Liebig's Law - nutrient gating of biomass", () => {
    it('drops biomass to zero when iron is zero for a high-demand plant', () => {
      const resources = buildResources(waterVolume, { iron: 0 });
      const result = photosynthesis([plant(100, 'monte_carlo')], { resources });

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('does NOT zero nutrient uptake when iron is zero (plants still draw)', () => {
      const resources = buildResources(waterVolume, { iron: 0 });
      const result = photosynthesis([plant(100, 'monte_carlo')], { resources });

      // Biomass is zero, but uptake draws from available pools. NO3 / PO4 / K
      // all have mass in resources and should be consumed.
      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBe(0); // clamped to available (0)
    });

    it('nutrient uptake splits in fertilizer ratio', () => {
      const abundant = buildResources(waterVolume, {}, 10); // 10× optimal — no clamping
      const result = photosynthesis([plant(100, 'amazon_sword')], { resources: abundant });

      const total =
        -result.nitrateDelta + -result.phosphateDelta + -result.potassiumDelta + -result.ironDelta;
      const formula = nutrientsDefaults.fertilizerFormula;
      expect(-result.nitrateDelta / total).toBeCloseTo(getNutrientRatio('nitrate', formula), 4);
      expect(-result.ironDelta / total).toBeCloseTo(getNutrientRatio('iron', formula), 4);
    });

    it('CO2 limit halves biomass at 50% optimal CO2', () => {
      const full = photosynthesis([plant(100, 'java_fern')]);
      const half = photosynthesis([plant(100, 'java_fern')], {
        co2: plantsDefaults.optimalCo2 / 2,
      });

      expect(half.oxygenProducedMg).toBeCloseTo(full.oxygenProducedMg / 2, 4);
      expect(half.co2ConsumedMg).toBeCloseTo(full.co2ConsumedMg / 2, 4);
    });
  });

  describe('scaling with plant size', () => {
    it('biomass scales linearly with plant size', () => {
      const r100 = photosynthesis([plant(100, 'java_fern')]);
      const r200 = photosynthesis([plant(200, 'java_fern')], {
        resources: buildResources(waterVolume, {}, 10),
      });

      expect(r200.oxygenProducedMg).toBeCloseTo(r100.oxygenProducedMg * 2, 4);
      expect(r200.co2ConsumedMg).toBeCloseTo(r100.co2ConsumedMg * 2, 4);
    });

    it('sums contributions from multiple plants', () => {
      const solo = photosynthesis([plant(100, 'java_fern')]);
      const pair = photosynthesis([plant(50, 'java_fern'), plant(50, 'java_fern')]);

      expect(pair.oxygenProducedMg).toBeCloseTo(solo.oxygenProducedMg, 4);
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
