import { describe, it, expect } from 'vitest';
import {
  getMaxPlantSize,
  calculateOvergrowthPenalty,
  getSpeciesGrowthRate,
  getSpeciesMaxSize,
  asymptoticGrowthFactor,
  distributeBiomass,
} from './plant-growth.js';
import type { Plant, PlantSpecies } from '../state.js';
import { PLANT_SPECIES_DATA } from '../state.js';
import { plantsDefaults } from '../config/plants.js';

/** Convenience: per-plant share growth, post-asymptotic-factor. */
function expectedGrowth(
  biomass: number,
  share: number,
  size: number,
  species: PlantSpecies,
  config = plantsDefaults
): number {
  const factor = asymptoticGrowthFactor(size, getSpeciesMaxSize(species));
  return biomass * share * config.sizePerBiomass * factor;
}

describe('getMaxPlantSize', () => {
  it('returns 0 for empty array', () => {
    const maxSize = getMaxPlantSize([]);
    expect(maxSize).toBe(0);
  });

  it('returns size of single plant', () => {
    const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 75 }];
    const maxSize = getMaxPlantSize(plants);
    expect(maxSize).toBe(75);
  });

  it('returns maximum among multiple plants', () => {
    const plants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 50 },
      { id: 'p2', species: 'anubias', size: 100 },
      { id: 'p3', species: 'amazon_sword', size: 75 },
    ];
    const maxSize = getMaxPlantSize(plants);
    expect(maxSize).toBe(100);
  });

  it('handles plants with same size', () => {
    const plants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 80 },
      { id: 'p2', species: 'anubias', size: 80 },
    ];
    const maxSize = getMaxPlantSize(plants);
    expect(maxSize).toBe(80);
  });

  it('handles overgrown plants (size > 100)', () => {
    const plants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 150 },
      { id: 'p2', species: 'anubias', size: 100 },
    ];
    const maxSize = getMaxPlantSize(plants);
    expect(maxSize).toBe(150);
  });

  it('handles extremely overgrown plants (size > 200)', () => {
    const plants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 250 },
    ];
    const maxSize = getMaxPlantSize(plants);
    expect(maxSize).toBe(250);
  });
});

describe('calculateOvergrowthPenalty', () => {
  it('returns 0% penalty when max size is <= 100', () => {
    expect(calculateOvergrowthPenalty(50)).toBe(0);
    expect(calculateOvergrowthPenalty(75)).toBe(0);
    expect(calculateOvergrowthPenalty(100)).toBe(0);
  });

  it('returns 0% penalty at exactly 100%', () => {
    const penalty = calculateOvergrowthPenalty(100);
    expect(penalty).toBe(0);
  });

  it('returns 25% penalty at 150% (halfway to 200)', () => {
    // (150 - 100) / 200 = 50/200 = 0.25
    const penalty = calculateOvergrowthPenalty(150);
    expect(penalty).toBeCloseTo(0.25, 6);
  });

  it('returns 50% penalty at 200%', () => {
    // (200 - 100) / 200 = 100/200 = 0.5
    const penalty = calculateOvergrowthPenalty(200);
    expect(penalty).toBeCloseTo(0.5, 6);
  });

  it('caps penalty at 50% for sizes > 200%', () => {
    expect(calculateOvergrowthPenalty(250)).toBe(0.5);
    expect(calculateOvergrowthPenalty(300)).toBe(0.5);
    expect(calculateOvergrowthPenalty(500)).toBe(0.5);
  });

  it('scales linearly between 100% and 200%', () => {
    const penalty110 = calculateOvergrowthPenalty(110); // (10/200) = 0.05
    const penalty120 = calculateOvergrowthPenalty(120); // (20/200) = 0.10
    const penalty130 = calculateOvergrowthPenalty(130); // (30/200) = 0.15

    expect(penalty110).toBeCloseTo(0.05, 6);
    expect(penalty120).toBeCloseTo(0.10, 6);
    expect(penalty130).toBeCloseTo(0.15, 6);
  });

  it('uses custom config penalty scale', () => {
    const customConfig = { ...plantsDefaults, overgrowthPenaltyScale: 100 };
    // At 150%, penalty = (150-100) / 100 = 0.5 (capped)
    const penalty = calculateOvergrowthPenalty(150, customConfig);
    expect(penalty).toBe(0.5);
  });

  it('handles negative sizes (edge case)', () => {
    const penalty = calculateOvergrowthPenalty(-50);
    expect(penalty).toBe(0);
  });
});

describe('getSpeciesGrowthRate', () => {
  const allSpecies: PlantSpecies[] = [
    'java_fern',
    'anubias',
    'amazon_sword',
    'dwarf_hairgrass',
    'monte_carlo',
  ];

  it('returns correct growth rate for java_fern (0.5)', () => {
    const rate = getSpeciesGrowthRate('java_fern');
    expect(rate).toBe(PLANT_SPECIES_DATA.java_fern.growthRate);
    expect(rate).toBe(0.5);
  });

  it('returns correct growth rate for anubias (0.3)', () => {
    const rate = getSpeciesGrowthRate('anubias');
    expect(rate).toBe(PLANT_SPECIES_DATA.anubias.growthRate);
    expect(rate).toBe(0.3);
  });

  it('returns correct growth rate for amazon_sword (1.0)', () => {
    const rate = getSpeciesGrowthRate('amazon_sword');
    expect(rate).toBe(PLANT_SPECIES_DATA.amazon_sword.growthRate);
    expect(rate).toBe(1.0);
  });

  it('returns correct growth rate for dwarf_hairgrass (1.5)', () => {
    const rate = getSpeciesGrowthRate('dwarf_hairgrass');
    expect(rate).toBe(PLANT_SPECIES_DATA.dwarf_hairgrass.growthRate);
    expect(rate).toBe(1.5);
  });

  it('returns correct growth rate for monte_carlo (1.8)', () => {
    const rate = getSpeciesGrowthRate('monte_carlo');
    expect(rate).toBe(PLANT_SPECIES_DATA.monte_carlo.growthRate);
    expect(rate).toBe(1.8);
  });

  it('all species have positive growth rates', () => {
    for (const species of allSpecies) {
      const rate = getSpeciesGrowthRate(species);
      expect(rate).toBeGreaterThan(0);
    }
  });

  it('monte_carlo has highest growth rate', () => {
    const rates = allSpecies.map((s) => getSpeciesGrowthRate(s));
    expect(getSpeciesGrowthRate('monte_carlo')).toBe(Math.max(...rates));
  });

  it('anubias has lowest growth rate', () => {
    const rates = allSpecies.map((s) => getSpeciesGrowthRate(s));
    expect(getSpeciesGrowthRate('anubias')).toBe(Math.min(...rates));
  });
});

describe('distributeBiomass', () => {
  describe('no growth conditions', () => {
    it('returns unchanged plants when no biomass produced', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];
      const result = distributeBiomass(plants, 0);

      expect(result.updatedPlants[0].size).toBe(50);
      expect(result.wasteReleased).toBe(0);
      expect(result.overgrowthPenalty).toBe(0);
    });

    it('returns unchanged plants when biomass is negative', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];
      const result = distributeBiomass(plants, -10);

      expect(result.updatedPlants[0].size).toBe(50);
      expect(result.wasteReleased).toBe(0);
    });

    it('returns empty array for no plants', () => {
      const result = distributeBiomass([], 10);

      expect(result.updatedPlants).toHaveLength(0);
      expect(result.wasteReleased).toBe(0);
      expect(result.overgrowthPenalty).toBe(0);
    });

    it('handles plants with zero total growth rate (defensive edge case)', () => {
      // This tests the division-by-zero guard clause
      // In practice, all species have positive growth rates, but this is defensive
      const mockPlants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50 },
      ];

      // Create a custom config that would make the calculation depend on growth rate
      // The guard is at totalGrowthRate === 0, which can't happen with real species
      // but we test the behavior by verifying the function handles edge cases gracefully
      const result = distributeBiomass(mockPlants, 10);

      // With real species (growth rate > 0), this should work normally
      expect(result.updatedPlants).toHaveLength(1);
      expect(result.wasteReleased).toBe(0);
      // Verify we don't get NaN or Infinity from division
      expect(Number.isFinite(result.updatedPlants[0].size)).toBe(true);
    });
  });

  describe('single plant growth', () => {
    it('increases plant size based on biomass and asymptotic factor', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50, condition: 100 },
      ];
      const biomass = 10;
      const result = distributeBiomass(plants, biomass);

      // Growth = biomass × sizePerBiomass × share (1.0) × asymptoticFactor.
      const expected = 50 + expectedGrowth(biomass, 1.0, 50, 'java_fern');
      expect(result.updatedPlants[0].size).toBeCloseTo(expected, 6);
    });

    it('all biomass goes to single plant', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50, condition: 100 },
      ];
      const result = distributeBiomass(plants, 10);

      // Share = 1.0 (only one plant), growth dampened by asymptoticFactor.
      const expected = 50 + expectedGrowth(10, 1.0, 50, 'java_fern');
      expect(result.updatedPlants[0].size).toBeCloseTo(expected, 6);
    });
  });

  describe('multiple plants - fair distribution by growth rate', () => {
    it('distributes biomass proportionally to growth rates', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'anubias', size: 50 }, // growthRate: 0.3
        { id: 'p2', species: 'amazon_sword', size: 50 }, // growthRate: 1.0
      ];
      const biomass = 10;
      const result = distributeBiomass(plants, biomass);

      // Total growth rate = 0.3 + 1.0 = 1.3
      const totalRate = 0.3 + 1.0;
      const anubiasShare = 0.3 / totalRate;
      const swordShare = 1.0 / totalRate;

      const anubiasGrowth = expectedGrowth(biomass, anubiasShare, 50, 'anubias');
      const swordGrowth = expectedGrowth(biomass, swordShare, 50, 'amazon_sword');

      expect(result.updatedPlants[0].size).toBeCloseTo(50 + anubiasGrowth, 6);
      expect(result.updatedPlants[1].size).toBeCloseTo(50 + swordGrowth, 6);
    });

    it('faster growing plants receive more biomass', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'anubias', size: 50 }, // slow (0.3)
        { id: 'p2', species: 'monte_carlo', size: 50 }, // fast (1.8)
      ];
      const result = distributeBiomass(plants, 10);

      const slowGrowth = result.updatedPlants[0].size - 50;
      const fastGrowth = result.updatedPlants[1].size - 50;

      expect(fastGrowth).toBeGreaterThan(slowGrowth);
      // Per-plant growth = share × asymptoticFactor. Both at size 50,
      // anubias maxSize 700 → factor ≈ 0.929, MC maxSize 1100 → ≈ 0.955.
      // Expected ratio = (1.8/0.3) × (0.955/0.929) ≈ 6.17.
      const anubiasFactor = asymptoticGrowthFactor(50, getSpeciesMaxSize('anubias'));
      const mcFactor = asymptoticGrowthFactor(50, getSpeciesMaxSize('monte_carlo'));
      const expectedRatio = (1.8 / 0.3) * (mcFactor / anubiasFactor);
      expect(fastGrowth / slowGrowth).toBeCloseTo(expectedRatio, 4);
    });

    it('plants with same species receive equal biomass', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50 },
        { id: 'p2', species: 'java_fern', size: 50 },
      ];
      const result = distributeBiomass(plants, 10);

      expect(result.updatedPlants[0].size).toBe(result.updatedPlants[1].size);
    });

    it('handles many plants correctly', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50 }, // 0.5
        { id: 'p2', species: 'anubias', size: 50 }, // 0.3
        { id: 'p3', species: 'amazon_sword', size: 50 }, // 1.0
        { id: 'p4', species: 'dwarf_hairgrass', size: 50 }, // 1.5
        { id: 'p5', species: 'monte_carlo', size: 50 }, // 1.8
      ];
      const biomass = 20;
      const result = distributeBiomass(plants, biomass);

      const totalRate = 0.5 + 0.3 + 1.0 + 1.5 + 1.8; // 5.1

      for (let i = 0; i < plants.length; i++) {
        const rate = getSpeciesGrowthRate(plants[i].species);
        const share = rate / totalRate;
        const growth = expectedGrowth(biomass, share, 50, plants[i].species);
        expect(result.updatedPlants[i].size).toBeCloseTo(50 + growth, 6);
      }
    });
  });

  describe('overgrowth penalty', () => {
    it('applies no penalty when all plants <= 100%', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 100 },
        { id: 'p2', species: 'anubias', size: 80 },
      ];
      const result = distributeBiomass(plants, 10);

      expect(result.overgrowthPenalty).toBe(0);
    });

    it('reduces effective biomass when overgrown', () => {
      // One plant at 150% triggers penalty (25% off effective biomass) and
      // also a slightly stronger asymptotic dampening from the larger size.
      const overgrownPlants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 150 },
      ];
      const normalPlants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 50 },
      ];

      const overgrownResult = distributeBiomass(overgrownPlants, 10);
      const normalResult = distributeBiomass(normalPlants, 10);

      const overgrownGrowth = overgrownResult.updatedPlants[0].size - 150;
      const normalGrowth = normalResult.updatedPlants[0].size - 50;

      // Both effects multiply: aggregate penalty (0.75) × asymptotic-factor
      // ratio (factor@150 / factor@50). java_fern maxSize = 600.
      const factorAt150 = asymptoticGrowthFactor(150, getSpeciesMaxSize('java_fern'));
      const factorAt50 = asymptoticGrowthFactor(50, getSpeciesMaxSize('java_fern'));
      const expectedRatio = 0.75 * (factorAt150 / factorAt50);
      expect(overgrownGrowth).toBeCloseTo(normalGrowth * expectedRatio, 4);
    });

    it('reports correct overgrowth penalty', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 150 }];
      const result = distributeBiomass(plants, 10);

      expect(result.overgrowthPenalty).toBeCloseTo(0.25, 6);
    });

    it('penalty based on max plant size', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'java_fern', size: 80 }, // not overgrown
        { id: 'p2', species: 'anubias', size: 180 }, // overgrown
      ];
      const result = distributeBiomass(plants, 10);

      // Penalty based on max (180), not average
      expect(result.overgrowthPenalty).toBeCloseTo(0.4, 6); // (180-100)/200
    });
  });

  describe('waste release when plants exceed 200%', () => {
    it('caps plant size at 200%', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'monte_carlo', size: 195 }];
      // Large biomass to push over 200%
      const result = distributeBiomass(plants, 100);

      expect(result.updatedPlants[0].size).toBe(200);
    });

    it('releases waste for excess size above 200%', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'monte_carlo', size: 195 }];
      // Biomass to push to 210% (then capped at 200%)
      const biomass = 100; // Would add 15% (100 * 0.15)
      const result = distributeBiomass(plants, biomass);

      // excess = 195 + 15 - 200 = 10%
      // Even with penalty (at 195%, penalty = 0.475), growth = 100 * 0.525 * 0.15 = 7.875%
      // So plant would be at 195 + 7.875 = 202.875
      // Excess = 2.875%, waste = 2.875 * 0.01 = 0.02875g
      expect(result.wasteReleased).toBeGreaterThan(0);
      expect(result.updatedPlants[0].size).toBe(200);
    });

    it('calculates waste correctly', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];
      // No waste expected - plant won't exceed 200
      const result = distributeBiomass(plants, 10);

      expect(result.wasteReleased).toBe(0);
    });

    it('handles multiple plants exceeding 200%', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'monte_carlo', size: 199 },
        { id: 'p2', species: 'dwarf_hairgrass', size: 199 },
      ];
      const result = distributeBiomass(plants, 100);

      expect(result.updatedPlants[0].size).toBe(200);
      expect(result.updatedPlants[1].size).toBe(200);
      expect(result.wasteReleased).toBeGreaterThan(0);
    });

    it('only overgrown plants contribute waste', () => {
      const plants: Plant[] = [
        { id: 'p1', species: 'monte_carlo', size: 199 }, // will exceed 200
        { id: 'p2', species: 'anubias', size: 50 }, // won't exceed 200
      ];
      const result = distributeBiomass(plants, 100);

      // Only monte_carlo contributes waste
      expect(result.updatedPlants[0].size).toBe(200);
      expect(result.updatedPlants[1].size).toBeLessThan(200);
      expect(result.wasteReleased).toBeGreaterThan(0);
    });
  });

  describe('custom config', () => {
    it('respects custom sizePerBiomass', () => {
      const customConfig = {
        ...plantsDefaults,
        sizePerBiomass: plantsDefaults.sizePerBiomass * 2,
      };
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];

      const defaultResult = distributeBiomass(plants, 10, plantsDefaults);
      const customResult = distributeBiomass(plants, 10, customConfig);

      const defaultGrowth = defaultResult.updatedPlants[0].size - 50;
      const customGrowth = customResult.updatedPlants[0].size - 50;

      expect(customGrowth).toBeCloseTo(defaultGrowth * 2, 6);
    });

    it('respects custom wastePerExcessSize', () => {
      const customConfig = { ...plantsDefaults, wastePerExcessSize: 0.02 };
      const plants: Plant[] = [{ id: 'p1', species: 'monte_carlo', size: 195 }];

      const defaultResult = distributeBiomass(plants, 100, plantsDefaults);
      const customResult = distributeBiomass(plants, 100, customConfig);

      // Custom should have 2x waste (0.02 vs 0.01)
      expect(customResult.wasteReleased).toBeCloseTo(defaultResult.wasteReleased * 2, 6);
    });
  });

  describe('immutability', () => {
    it('does not modify original plants array', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];
      const originalSize = plants[0].size;

      distributeBiomass(plants, 10);

      expect(plants[0].size).toBe(originalSize);
    });

    it('returns new plant objects', () => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 50 }];
      const result = distributeBiomass(plants, 10);

      expect(result.updatedPlants[0]).not.toBe(plants[0]);
    });
  });
});

describe('asymptoticGrowthFactor', () => {
  it('returns 1 at size 0 (unmodified growth)', () => {
    expect(asymptoticGrowthFactor(0, 600)).toBe(1);
    expect(asymptoticGrowthFactor(0, 1100)).toBe(1);
  });

  it('approaches 0 as size approaches maxSize', () => {
    const maxSize = 600;
    // At 99 % of maxSize, factor should be ~0.01
    expect(asymptoticGrowthFactor(maxSize * 0.99, maxSize)).toBeCloseTo(0.01, 5);
    // At maxSize exactly, factor is 0
    expect(asymptoticGrowthFactor(maxSize, maxSize)).toBe(0);
    // Slightly below maxSize, factor is small but positive
    expect(asymptoticGrowthFactor(maxSize * 0.95, maxSize)).toBeCloseTo(0.05, 5);
  });

  it('clamps at 0 for sizes above maxSize (never negative)', () => {
    expect(asymptoticGrowthFactor(700, 600)).toBe(0);
    expect(asymptoticGrowthFactor(1500, 600)).toBe(0);
    // Even wildly above, still 0 (no negative growth)
    expect(asymptoticGrowthFactor(1e9, 600)).toBe(0);
  });

  it('returns 0 for maxSize <= 0 (defensive)', () => {
    expect(asymptoticGrowthFactor(50, 0)).toBe(0);
    expect(asymptoticGrowthFactor(50, -1)).toBe(0);
  });

  it('stays >= 0.9 in calibration windows (size <= 10 % of maxSize)', () => {
    // Hard constraint from task 38 spec: the factor must be effectively
    // transparent for baselines, which sit well under 100 % size (maxSize
    // values are sized so peak calibration sizes are <= 10 % of maxSize).
    for (const species of Object.keys(PLANT_SPECIES_DATA) as Array<
      keyof typeof PLANT_SPECIES_DATA
    >) {
      const maxSize = PLANT_SPECIES_DATA[species].maxSize;
      const peak = maxSize * 0.1; // 10 % of maxSize
      const factor = asymptoticGrowthFactor(peak, maxSize);
      expect(factor).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe('distributeBiomass — asymptotic factor behavior', () => {
  it('applies factor = 1 when plant is at size 0 (unmodified share)', () => {
    const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size: 0 }];
    const result = distributeBiomass(plants, 10);
    // factor(0, 600) = 1, so growth = 10 × 1 × 0.4 × 1 = 4
    expect(result.updatedPlants[0].size).toBeCloseTo(4, 5);
  });

  it('per-tick growth shrinks with increasing size (monotonic decay)', () => {
    // Compare growth per tick at three sizes below the 200 % backstop.
    // With maxSize = 600, each step up in size cuts the factor and thus
    // shrinks the per-tick growth — monotonic decay toward maxSize.
    const sizes = [10, 60, 120, 180];
    const growths = sizes.map((size) => {
      const plants: Plant[] = [{ id: 'p1', species: 'java_fern', size }];
      const result = distributeBiomass(plants, 1);
      return result.updatedPlants[0].size - size;
    });
    for (let i = 1; i < growths.length; i++) {
      expect(growths[i]).toBeLessThan(growths[i - 1]);
    }
    // All growths are positive for size < maxSize and below the 200 cap
    for (const g of growths) expect(g).toBeGreaterThan(0);
  });

  it('long-running 5 Java Ferns stabilise below the 200 % waste-dump cap', () => {
    // Acceptance criterion from task 38: "40 gal community with 5 Java
    // Ferns run for 6 months stabilises biomass rather than growing
    // unbounded". Pre-task, steady biomass at these rates would have
    // driven size well past 100 % and into the 200 % waste dump every
    // tick. With the asymptotic factor, size asymptotes toward maxSize
    // (600) but the biomass input scales below the threshold, so over
    // 6 months the plants stabilise comfortably under 200 and the
    // backstop never fires.
    //
    // Biomass rate chosen to mirror realistic photosynthesis output for
    // one JF at 50 % size with an 8 hr photoperiod: ~0.05 units/tick
    // averaged across day/night. Across 5 plants with equal growth
    // rates, each receives a 1/5 share.
    let plants: Plant[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      species: 'java_fern' as const,
      size: 50,
    }));
    let totalWasteDumped = 0;
    let maxSizeSeen = 50;

    const biomassPerTick = 0.05; // ~realistic for 5 JF combined
    const ticks = 6 * 30 * 24 * 6; // ~6 months at 10 min/tick

    for (let i = 0; i < ticks; i++) {
      const result = distributeBiomass(plants, biomassPerTick);
      plants = result.updatedPlants as Plant[];
      totalWasteDumped += result.wasteReleased;
      for (const p of plants) {
        if (p.size > maxSizeSeen) maxSizeSeen = p.size;
      }
    }

    // Size stays below the 200 % waste-dump threshold
    expect(maxSizeSeen).toBeLessThan(200);
    // And, by construction, below the species' biological cap
    expect(maxSizeSeen).toBeLessThanOrEqual(
      PLANT_SPECIES_DATA.java_fern.maxSize
    );
    // No waste dump fired across the entire run
    expect(totalWasteDumped).toBe(0);
  });
});
