/**
 * Photosynthesis — plants and algae alike.
 *
 * Photosynthesis occurs when lights are on and moves gases only — carbon
 * fixed, oxygen released. Growth flows through the surplus supply chain
 * (vitality → bank → growth), and the nutrients new tissue takes come out of
 * the water and the bed where growth buys it (`drawTissue`).
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, monodUptake } from '../core/kinetics.js';
import { getCo2HalfSaturation, plantTraits, type PlantSpecies } from '../plants/species.js';
import { metabolicRateUnits, saturationIrradiance } from './flora.js';
import { getMassFromPpm } from '../resources/index.js';
import { rateUnits } from '../plants/canopy.js';

export interface PhotosynthesisResult {
  /** Oxygen released (mg, absolute — caller divides by water volume for mg/L delta) */
  oxygenProducedMg: number;
  /** Carbon fixed (mg of CO2, absolute — caller divides by water volume for mg/L delta) */
  co2ConsumedMg: number;
}

/**
 * Carbon limitation of a species' photosynthesis — Monod on dissolved CO₂,
 * half rate at the species' half-saturation.
 */
export function calculateCo2Factor(
  co2: number,
  species: PlantSpecies,
  config: PlantsConfig = plantsDefaults
): number {
  return monodFactor(co2, getCo2HalfSaturation(species, config));
}

/** One photosynthesiser's hour, as the carbon it can fix reads it. */
export interface CarbonFixer {
  rateUnits: number;
  /** `tanh(PAR / Ik)` at the light it stands in, 0–1. */
  lightResponse: number;
  /** Liebig sufficiency, 0–1. */
  sufficiency: number;
  /** Dissolved CO₂ (mg/L) it fixes at half rate on. */
  co2HalfSaturation: number;
}

/** A plant as photosynthesis reads it, at the PAR on its mean leaf. */
export function plantFixer(
  plant: Plant,
  par: number,
  sufficiency: number,
  config: PlantsConfig = plantsDefaults
): CarbonFixer {
  const traits = plantTraits(plant.species);
  return {
    rateUnits: metabolicRateUnits(rateUnits(plant), traits),
    lightResponse: lightSaturationFactor(par, saturationIrradiance(traits, config)),
    sufficiency,
    co2HalfSaturation: getCo2HalfSaturation(plant.species, config),
  };
}

/**
 * Calculate photosynthesis gas effects for everything fixing carbon in the
 * tank, drawn together on the one CO₂ stock.
 *
 * Per fixer, with m_i its rate units:
 *   carbon_i = m_i × lightResponse_i × sufficiency_i × basePhotosynthesisRate × co2PerRateUnit
 *
 * Aggregate outputs, all masses in mg:
 *   co2    = monodUptake(CO2, Σ carbon_i, carbon-weighted mean of the CO₂ half-saturations, as mass)
 *   oxygen = co2 × CO2_TO_O2_MASS_RATIO
 */
export function calculatePhotosynthesis(
  fixers: readonly CarbonFixer[],
  co2: number,
  waterVolume: number,
  plantsConfig: PlantsConfig = plantsDefaults
): PhotosynthesisResult {
  let carbonCapacity = 0;
  let carbonHalfSaturationWeight = 0;
  for (const fixer of fixers) {
    const carbon =
      fixer.rateUnits *
      fixer.lightResponse *
      fixer.sufficiency *
      plantsConfig.basePhotosynthesisRate *
      plantsConfig.co2PerRateUnit;
    carbonCapacity += carbon;
    carbonHalfSaturationWeight += carbon * fixer.co2HalfSaturation;
  }

  const co2ConsumedMg = monodUptake(
    getMassFromPpm(co2, waterVolume),
    carbonCapacity,
    getMassFromPpm(carbonHalfSaturationWeight / carbonCapacity, waterVolume)
  );

  return {
    oxygenProducedMg: co2ConsumedMg * CO2_TO_O2_MASS_RATIO,
    co2ConsumedMg,
  };
}
