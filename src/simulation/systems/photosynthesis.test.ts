import { describe, it, expect } from 'vitest';
import {
  calculateCo2Factor,
  calculatePhotosynthesis,
  getTotalPlantSize,
  GH_HALF_SATURATION,
  GH_PER_NITRATE_DRAWN,
  type PhotosynthesisResult,
} from './photosynthesis.js';
import {
  calculateNutrientSufficiency,
  speciesDemand,
  speciesHalfSaturation,
} from './nutrients.js';
import { calculateRespiration } from './respiration.js';
import { plantsDefaults, type PlantsConfig } from '../config/plants.js';
import { nutrientsDefaults, type Nutrient, type NutrientsConfig } from '../config/nutrients.js';
import { AIR_SATURATED_O2 } from '../config/nitrogen-cycle.js';
import type { Plant, Resources } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { CO2_TO_O2_MASS_RATIO, MW_CO2, MW_O2 } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, monodUptake } from '../core/kinetics.js';
import { getSaturationIrradiance } from '../plants/species.js';

const INJECTED_CO2 = 25;
const PLENTIFUL_CO2 = 1e9;

/** Nutrients at this many half-saturations: at the default the water all but saturates every plant. */
function buildResources(
  waterVolume: number,
  overrides: Partial<Resources> = {},
  nutrientMultiple = 1000
): Resources {
  const mass = (ppm: number): number => ppm * waterVolume * nutrientMultiple;
  return {
    water: waterVolume,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    aeration: false,
    food: 0,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: mass(nutrientsDefaults.halfSaturation.nitrate),
    phosphate: mass(nutrientsDefaults.halfSaturation.phosphate),
    potassium: mass(nutrientsDefaults.halfSaturation.potassium),
    iron: mass(nutrientsDefaults.halfSaturation.iron),
    oxygen: 8,
    co2: INJECTED_CO2,
    kh: 0,
    gh: 0,
    aob: 0,
    nob: 0,
    ...overrides,
  };
}

function plant(size: number, species: PlantSpecies = 'amazon_sword'): Plant {
  return {
    id: `p-${species}-${size}`,
    species,
    size,
    condition: 100,
    surplus: 0,
  };
}

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
  it('is 0 without CO2 and half rate at the species half-saturation', () => {
    expect(calculateCo2Factor(0, 'monte_carlo')).toBe(0);
    expect(calculateCo2Factor(plantsDefaults.highCo2HalfSaturation, 'monte_carlo')).toBeCloseTo(0.5, 10);
  });

  it('saturates: each doubling of CO2 buys less', () => {
    const f = (co2: number): number => calculateCo2Factor(co2, 'amazon_sword');
    expect(f(8) - f(4)).toBeLessThan(f(4) - f(2));
    expect(f(1000)).toBeLessThan(1);
  });

  it('runs a high-need species further below saturation than a low-need one on the same water', () => {
    expect(calculateCo2Factor(4, 'monte_carlo')).toBeLessThan(calculateCo2Factor(4, 'anubias'));
  });
});

describe('calculatePhotosynthesis', () => {
  const waterVolume = 100;
  const light = 50;

  function photosynthesis(
    plants: readonly Plant[],
    {
      co2 = INJECTED_CO2,
      resources = buildResources(waterVolume),
      volume = waterVolume,
      lightPar = light,
      config = plantsDefaults,
      nutrients = nutrientsDefaults,
    }: {
      co2?: number;
      resources?: Resources;
      volume?: number;
      lightPar?: number;
      config?: PlantsConfig;
      nutrients?: NutrientsConfig;
    } = {}
  ): PhotosynthesisResult {
    return calculatePhotosynthesis(
      plants,
      lightPar,
      co2,
      resources,
      volume,
      suffMap(plants, resources, volume),
      config,
      nutrients
    );
  }

  const SATURATED = buildResources(waterVolume, {}, 1e9);

  function capacity(p: Plant, n: Nutrient): number {
    const potential =
      (p.size / 100) *
      calculateCo2Factor(INJECTED_CO2, p.species) *
      lightSaturationFactor(light, getSaturationIrradiance(p.species, plantsDefaults)) *
      plantsDefaults.basePhotosynthesisRate;
    return potential * speciesDemand(p.species)[n] * nutrientsDefaults.uptakePerRateUnit[n];
  }

  function carbonCapacity(p: Plant, config = plantsDefaults): number {
    return (
      (p.size / 100) *
      lightSaturationFactor(light, getSaturationIrradiance(p.species, config)) *
      calculateNutrientSufficiency(buildResources(waterVolume), waterVolume, p.species) *
      config.basePhotosynthesisRate *
      config.co2PerRateUnit
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
      const result = photosynthesis([plant(100, 'monte_carlo')]);

      expect(result.oxygenProducedMg).toBeGreaterThan(0);
      expect(result.co2ConsumedMg).toBeGreaterThan(0);
      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBeLessThan(0);
    });

    it('takes each nutrient in the ratio of its species demand', () => {
      const result = photosynthesis([plant(100, 'java_fern')], { resources: SATURATED });
      const demand = speciesDemand('java_fern');
      const { uptakePerRateUnit } = nutrientsDefaults;

      expect(result.potassiumDelta / result.nitrateDelta).toBeCloseTo(
        (demand.potassium * uptakePerRateUnit.potassium) / (demand.nitrate * uptakePerRateUnit.nitrate),
        6
      );
      expect(result.ironDelta / result.nitrateDelta).toBeCloseTo(
        (demand.iron * uptakePerRateUnit.iron) / (demand.nitrate * uptakePerRateUnit.nitrate),
        6
      );
    });

    it('draws nutrients in proportion to its carbon Monod', () => {
      const draw = (co2: number): number =>
        photosynthesis([plant(100, 'java_fern')], { co2, resources: SATURATED }).nitrateDelta;
      const monod = (co2: number): number => calculateCo2Factor(co2, 'java_fern', plantsDefaults);

      expect(draw(4) / draw(INJECTED_CO2)).toBeCloseTo(monod(4) / monod(INJECTED_CO2), 10);
      expect(draw(4)).toBeGreaterThan(draw(INJECTED_CO2));
    });

    it('draws GH on its own Monod, off the nitrate it actually draws', () => {
      const expectGhDrawOn = (resources: Resources): void => {
        const result = photosynthesis([plant(100, 'java_fern')], { resources });
        expect(result.ghDelta).toBeCloseTo(
          -monodUptake(
            resources.gh,
            -result.nitrateDelta * GH_PER_NITRATE_DRAWN,
            GH_HALF_SATURATION * waterVolume
          ),
          12
        );
      };

      expectGhDrawOn(buildResources(waterVolume, { gh: 10000 }));
      expectGhDrawOn(buildResources(waterVolume, { gh: 10000, nitrate: waterVolume * 0.5 }));
      expectGhDrawOn(buildResources(waterVolume, { gh: 0.01 }));
    });

    it('takes no GH from soft water, and never more than the water holds', () => {
      expect(photosynthesis([plant(100, 'java_fern')]).ghDelta).toBe(0);
      const trace = photosynthesis([plant(100, 'java_fern')], {
        resources: buildResources(waterVolume, { gh: 0.01 }),
      });
      expect(trace.ghDelta).toBeLessThan(0);
      expect(-trace.ghDelta).toBeLessThan(0.01);
    });

    it('limiting factor approaches 1 in rich water', () => {
      const result = photosynthesis([plant(100, 'java_fern')]);

      expect(result.limitingFactor).toBeCloseTo(1.0, 2);
    });
  });

  describe('stoichiometry', () => {
    it('releases one mole of O2 per mole of carbon fixed', () => {
      const result = photosynthesis([plant(100, 'java_fern')]);

      expect(result.oxygenProducedMg / MW_O2).toBeCloseTo(result.co2ConsumedMg / MW_CO2, 10);
    });

    it('holds the ratio however the carbon yield is tuned', () => {
      const result = photosynthesis([plant(100, 'java_fern')], {
        config: { ...plantsDefaults, co2PerRateUnit: 7 },
      });

      expect(result.oxygenProducedMg / MW_O2).toBeCloseTo(result.co2ConsumedMg / MW_CO2, 10);
    });

    it('shares the carbon yield with respiration, which is why there is one of it', () => {
      const fern = plant(100, 'java_fern');
      for (const config of [plantsDefaults, { ...plantsDefaults, co2PerRateUnit: 7 }]) {
        const respired = calculateRespiration(100, 25, AIR_SATURATED_O2, config).co2ProducedMg;
        const capacity =
          ((respired / config.baseRespirationRate) * config.basePhotosynthesisRate) /
          monodFactor(AIR_SATURATED_O2, config.respirationOxygenHalfSaturation) *
          lightSaturationFactor(light, getSaturationIrradiance('java_fern', config)) *
          calculateNutrientSufficiency(buildResources(waterVolume), waterVolume, 'java_fern');

        expect(photosynthesis([fern], { config }).co2ConsumedMg).toBeCloseTo(
          monodUptake(
            INJECTED_CO2 * waterVolume,
            capacity,
            plantsDefaults.lowCo2HalfSaturation * waterVolume
          ),
          10
        );
      }
    });

    it('draws carbon on the Monod curve read at the CO₂ the tick ends on', () => {
      const fern = plant(100, 'java_fern');
      const k = plantsDefaults.lowCo2HalfSaturation;
      for (const co2 of [0.01, 0.5, k, 10, 1e4]) {
        expect(photosynthesis([fern], { co2 }).co2ConsumedMg).toBeCloseTo(
          monodUptake(co2 * waterVolume, carbonCapacity(fern), k * waterVolume),
          12
        );
      }
    });

    it('pools the carbon draw at the capacity-weighted CO₂ half-saturation', () => {
      const fern = plant(300, 'java_fern');
      const monte = plant(100, 'monte_carlo');
      const [a, b] = [carbonCapacity(fern), carbonCapacity(monte)];
      const weighted =
        (a * plantsDefaults.lowCo2HalfSaturation + b * plantsDefaults.highCo2HalfSaturation) /
        (a + b);

      expect(photosynthesis([fern, monte], { co2: 2 }).co2ConsumedMg).toBeCloseTo(
        monodUptake(2 * waterVolume, a + b, weighted * waterVolume),
        12
      );
    });

    it('never takes all the carbon the water holds, however dense the planting', () => {
      const nano = 40;
      const ferns = [1, 2, 3, 4].map((i) => ({ ...plant(100, 'java_fern'), id: `fern-${i}` }));
      for (const co2 of [0.3, 1.5, 5]) {
        const drawn = photosynthesis(ferns, {
          co2,
          resources: buildResources(nano),
          volume: nano,
        });

        expect(drawn.co2ConsumedMg).toBeGreaterThan(0);
        expect(drawn.co2ConsumedMg).toBeLessThan(co2 * nano);
        expect(drawn.oxygenProducedMg).toBeCloseTo(drawn.co2ConsumedMg * CO2_TO_O2_MASS_RATIO, 10);
      }
    });
  });

  describe('the volume term', () => {
    it('moves the same gas mass whatever the tank around the plants', () => {
      const plants = [plant(100, 'java_fern')];
      const small = photosynthesis(plants, {
        co2: PLENTIFUL_CO2,
        resources: buildResources(150, {}, 10),
        volume: 150,
      });
      const large = photosynthesis(plants, {
        co2: PLENTIFUL_CO2,
        resources: buildResources(300, {}, 10),
        volume: 300,
      });

      expect(large.oxygenProducedMg).toBeCloseTo(small.oxygenProducedMg, 6);
      expect(large.co2ConsumedMg).toBeCloseTo(small.co2ConsumedMg, 6);
    });

    it('moves the concentration by the volume ratio', () => {
      const plants = [plant(100, 'java_fern')];
      const perLitre = (volume: number): number =>
        photosynthesis(plants, {
          co2: PLENTIFUL_CO2,
          resources: buildResources(volume, {}, 10),
          volume,
        }).oxygenProducedMg / volume;

      expect(perLitre(150) / perLitre(300)).toBeCloseTo(2, 6);
    });
  });

  describe("Liebig's Law - nutrient gating of biomass", () => {
    it('drops biomass to zero when iron is zero for a high-demand plant', () => {
      const resources = buildResources(waterVolume, { iron: 0 });
      const result = photosynthesis([plant(100, 'monte_carlo')], { resources });

      expect(result.oxygenProducedMg).toBe(0);
      expect(result.limitingFactor).toBe(0);
    });

    it('keeps drawing the other nutrients when iron caps growth', () => {
      const resources = buildResources(waterVolume, { iron: 0 });
      const result = photosynthesis([plant(100, 'monte_carlo')], { resources });

      expect(result.nitrateDelta).toBeLessThan(0);
      expect(result.phosphateDelta).toBeLessThan(0);
      expect(result.potassiumDelta).toBeLessThan(0);
      expect(result.ironDelta).toBe(0);
    });

    it('takes nutrients in its own ratio, whatever the fertilizer carries', () => {
      const monte = [plant(100, 'monte_carlo')];
      const result = photosynthesis(monte);
      const skewed = photosynthesis(monte, {
        nutrients: {
          ...nutrientsDefaults,
          fertilizerFormula: { nitrate: 1, phosphate: 10, potassium: 1, iron: 2 },
        },
      });

      expect(skewed).toEqual(result);
      const { uptakePerRateUnit } = nutrientsDefaults;
      expect(result.phosphateDelta / result.nitrateDelta).toBeCloseTo(
        uptakePerRateUnit.phosphate / uptakePerRateUnit.nitrate,
        2
      );
    });

    it('resolves each draw on the Monod curve read at the end of the tick', () => {
      const monte = plant(100, 'monte_carlo');
      const kMass = speciesHalfSaturation('monte_carlo', 'phosphate') * waterVolume;
      for (const multiple of [0.01, 0.5, 1, 10, 1e4]) {
        const stock = kMass * multiple;
        const result = photosynthesis([monte], {
          resources: buildResources(waterVolume, { phosphate: stock }),
        });

        expect(-result.phosphateDelta).toBeCloseTo(
          monodUptake(stock, capacity(monte, 'phosphate'), kMass),
          12
        );
      }
    });

    it('pools the planting into one draw, at the capacity-weighted half-saturation', () => {
      const fern = plant(300, 'java_fern');
      const monte = plant(100, 'monte_carlo');
      const stock = nutrientsDefaults.halfSaturation.iron * waterVolume;
      const result = photosynthesis([fern, monte], {
        resources: buildResources(waterVolume, { iron: stock }),
      });
      const [a, b] = [capacity(fern, 'iron'), capacity(monte, 'iron')];
      const weighted =
        (a * speciesHalfSaturation('java_fern', 'iron') +
          b * speciesHalfSaturation('monte_carlo', 'iron')) /
        (a + b);

      expect(-result.ironDelta).toBeCloseTo(
        monodUptake(stock, a + b, weighted * waterVolume),
        12
      );
    });

    it('never draws more of a nutrient than the water holds', () => {
      const trace = buildResources(waterVolume, { phosphate: 1e-6 });
      const result = photosynthesis([plant(5000, 'monte_carlo')], { resources: trace });

      expect(-result.phosphateDelta).toBeLessThanOrEqual(1e-6);
    });

  });

  describe('scaling with light intensity', () => {
    function at(lightPar: number, species: PlantSpecies = 'java_fern'): PhotosynthesisResult {
      return photosynthesis([plant(100, species)], {
        lightPar,
        resources: buildResources(waterVolume, {}, 10),
      });
    }

    it('makes more of everything under a brighter fixture', () => {
      const dim = at(10);
      const bright = at(40);

      expect(bright.oxygenProducedMg).toBeGreaterThan(dim.oxygenProducedMg);
      expect(bright.co2ConsumedMg).toBeGreaterThan(dim.co2ConsumedMg);
      expect(bright.nitrateDelta).toBeLessThan(dim.nitrateDelta);
    });

    it('stops making more of it once the light saturates', () => {
      const steps = [10, 20, 40, 80, 160].map((par) => at(par).oxygenProducedMg);
      const gains = steps.slice(1).map((made, i) => made - steps[i]!);

      for (let i = 1; i < gains.length; i++) {
        expect(gains[i]!).toBeGreaterThan(0);
        expect(gains[i]!).toBeLessThan(gains[i - 1]!);
      }
      expect(gains[gains.length - 1]! / gains[0]!).toBeLessThan(0.05);
    });

    it('draws nutrients on the same curve, since uptake rides the potential rate', () => {
      const drawn = [10, 20, 40, 80, 160].map((par) => -at(par).nitrateDelta);
      const gains = drawn.slice(1).map((draw, i) => draw - drawn[i]!);

      for (let i = 1; i < gains.length; i++) {
        expect(gains[i]!).toBeGreaterThan(0);
        expect(gains[i]!).toBeLessThan(gains[i - 1]!);
      }
    });

    it('saturates a shade species before a sun species', () => {
      const share = (species: PlantSpecies): number =>
        at(50, species).oxygenProducedMg / at(1e4, species).oxygenProducedMg;

      expect(share('anubias')).toBeGreaterThan(share('monte_carlo'));
    });

    it('reads Ik off the tuned factor rather than a constant of its own', () => {
      const made = (saturationIrradianceFactor: number): number =>
        photosynthesis([plant(100, 'java_fern')], {
          lightPar: 20,
          resources: buildResources(waterVolume, {}, 10),
          config: { ...plantsDefaults, saturationIrradianceFactor },
        }).oxygenProducedMg;

      expect(made(4)).toBeLessThan(made(2));
      expect(made(2)).toBeLessThan(made(1));
      expect(made(0)).toBeGreaterThan(made(1));
    });

    it('reads each plant at its own species, not the tank at an average', () => {
      const made = (plants: Plant[]): number =>
        photosynthesis(plants, {
          co2: PLENTIFUL_CO2,
          lightPar: 30,
          resources: buildResources(waterVolume, {}, 10),
        }).oxygenProducedMg;
      const shade = made([plant(100, 'anubias')]);
      const sun = made([plant(100, 'monte_carlo')]);

      expect(made([plant(100, 'anubias'), plant(100, 'monte_carlo')])).toBeCloseTo(shade + sun, 6);
    });
  });

  describe('scaling with plant size', () => {
    it('biomass scales linearly with plant size while the carbon is plentiful', () => {
      const r100 = photosynthesis([plant(100, 'java_fern')], { co2: PLENTIFUL_CO2 });
      const r200 = photosynthesis([plant(200, 'java_fern')], { co2: PLENTIFUL_CO2 });

      expect(r200.oxygenProducedMg).toBeCloseTo(r100.oxygenProducedMg * 2, 6);
      expect(r200.co2ConsumedMg).toBeCloseTo(r100.co2ConsumedMg * 2, 6);
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

  it('sums sizes of multiple plants', () => {
    expect(getTotalPlantSize([{ size: 50 }, { size: 75 }, { size: 100 }])).toBe(225);
  });
});
