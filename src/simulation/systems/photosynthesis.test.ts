import { describe, it, expect } from 'vitest';
import {
  calculateCo2Factor,
  carbonGases,
  offerCarbon,
  photosynthateOf,
  plantFixer,
  type CarbonFixer,
} from './photosynthesis.js';
import { plantsDefaults, type PlantsConfig } from '../config/plants.js';
import type { Plant } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { CO2_TO_CH2O_MASS_RATIO, MW_CO2, MW_O2 } from '../core/chemistry.js';
import { lightSaturationFactor, monodUptake } from '../core/kinetics.js';
import { plantTraits } from '../plants/species.js';
import { saturationIrradiance } from './flora.js';
import { rateUnits } from '../plants/canopy.js';
import { plantRecord } from '../tests/plant.js';

const INJECTED_CO2 = 25;
const PLENTIFUL_CO2 = 1e9;

function plant(size: number, species: PlantSpecies = 'amazon_sword'): Plant {
  return plantRecord({ id: `p-${species}-${size}`, species, size });
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

describe('offerCarbon', () => {
  const waterVolume = 100;
  const light = 50;

  function offered(
    plants: readonly Plant[],
    {
      co2 = INJECTED_CO2,
      volume = waterVolume,
      lightPar = light,
      omega = 1,
      plantsConfig = plantsDefaults,
    }: { co2?: number; volume?: number; lightPar?: number; omega?: number; plantsConfig?: PlantsConfig } = {}
  ): number[] {
    return offerCarbon(
      plants.map((p) => plantFixer(p, lightPar, omega, plantsConfig)),
      co2,
      volume,
      plantsConfig
    );
  }
  const total = (mg: number[]): number => mg.reduce((sum, m) => sum + m, 0);

  const metabolic = (p: Plant, size: number): number => rateUnits({ species: p.species, size }) * plantTraits(p.species).growthRate;

  function carbonCapacity(p: Plant, size: number, plantsConfig = plantsDefaults): number {
    return (
      metabolic(p, size) *
      lightSaturationFactor(light, saturationIrradiance(plantTraits(p.species), plantsConfig)) *
      plantsConfig.basePhotosynthesisRate *
      plantsConfig.co2PerRateUnit
    );
  }

  it('offers nothing without light, plants, water or CO₂', () => {
    expect(total(offered([plant(100)], { lightPar: 0 }))).toBe(0);
    expect(offered([])).toEqual([]);
    expect(total(offered([plant(100)], { volume: 0 }))).toBe(0);
    expect(total(offered([plant(100)], { co2: 0 }))).toBe(0);
    expect(total(offered([plant(100)], { omega: 0 }))).toBe(0);
  });

  it('draws carbon on the Monod curve read at the CO₂ the tick ends on', () => {
    const fern = plant(100, 'java_fern');
    const k = plantsDefaults.lowCo2HalfSaturation;
    for (const co2 of [0.01, 0.5, k, 10, 1e4]) {
      expect(offered([fern], { co2 })[0]).toBeCloseTo(
        monodUptake(co2 * waterVolume, carbonCapacity(fern, 100), k * waterVolume),
        12
      );
    }
  });

  it('pools the carbon draw at the capacity-weighted CO₂ half-saturation, each fixer its own share', () => {
    const fern = plant(100, 'java_fern');
    const monte = plant(100, 'monte_carlo');
    const [a, b] = [carbonCapacity(fern, 100), carbonCapacity(monte, 100)];
    const weighted =
      (a * plantsDefaults.lowCo2HalfSaturation + b * plantsDefaults.highCo2HalfSaturation) / (a + b);
    const pooled = offered([fern, monte], { co2: 2 });

    expect(total(pooled)).toBeCloseTo(monodUptake(2 * waterVolume, a + b, weighted * waterVolume), 12);
    expect(pooled[0] / pooled[1]).toBeCloseTo(a / b, 12);
  });

  it('never offers all the carbon the water holds, however dense the planting', () => {
    const nano = 40;
    const ferns = [1, 2, 3, 4].map((i) => ({ ...plant(100, 'java_fern'), id: `fern-${i}` }));
    for (const co2 of [0.3, 1.5, 5]) {
      const drawn = total(offered(ferns, { co2, volume: nano }));
      expect(drawn).toBeGreaterThan(0);
      expect(drawn).toBeLessThan(co2 * nano);
    }
  });

  it('offers the same carbon mass whatever the tank around the plants, the carbon plentiful', () => {
    const plants = [plant(100, 'java_fern')];
    expect(total(offered(plants, { co2: PLENTIFUL_CO2, volume: 40 }))).toBeCloseTo(
      total(offered(plants, { co2: PLENTIFUL_CO2, volume: 400 })),
      6
    );
  });

  it('scales with the oxygen pace', () => {
    const plants = [plant(100)];
    expect(total(offered(plants, { co2: PLENTIFUL_CO2, omega: 0.5 }))).toBeCloseTo(
      0.5 * total(offered(plants, { co2: PLENTIFUL_CO2 })),
      9
    );
  });

  it('offers more under a brighter fixture until the light saturates, a shade species first', () => {
    const at = (par: number, species: PlantSpecies): number =>
      total(offered([plant(100, species)], { co2: PLENTIFUL_CO2, lightPar: par }));
    expect(at(40, 'amazon_sword')).toBeGreaterThan(at(20, 'amazon_sword'));
    expect(at(1000, 'amazon_sword') / at(500, 'amazon_sword')).toBeCloseTo(1, 3);
    const shade = at(20, 'anubias') / at(1000, 'anubias');
    const sun = at(20, 'monte_carlo') / at(1000, 'monte_carlo');
    expect(shade).toBeGreaterThan(sun);
  });

  it('scales with leaf area at the species’ growth rate while the carbon is plentiful', () => {
    const at = (size: number): number => total(offered([plant(size)], { co2: PLENTIFUL_CO2 }));
    expect(at(80)).toBeCloseTo(2 * at(40), 9);
    const fixer: CarbonFixer = plantFixer(plant(100, 'monte_carlo'), light, 1);
    expect(fixer.metabolicRateUnits).toBeCloseTo(metabolic(plant(100, 'monte_carlo'), 100), 12);
  });
});

describe('the carbon yield', () => {
  it('fixes a mg of CO₂ into its CH₂O, and fixing or burning a gram of it moves a mole of O₂ per mole of CO₂', () => {
    expect(photosynthateOf(1000)).toBeCloseTo(CO2_TO_CH2O_MASS_RATIO, 12);
    const { co2, oxygen } = carbonGases(photosynthateOf(440));
    expect(co2).toBeCloseTo(440, 9);
    expect(oxygen / MW_O2).toBeCloseTo(co2 / MW_CO2, 12);
  });
});
