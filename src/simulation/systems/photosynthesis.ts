/**
 * Photosynthesis calculations for plants.
 *
 * Photosynthesis occurs when lights are on and moves gases only — carbon
 * fixed, oxygen released. Plant size growth flows through the surplus supply
 * chain (vitality → `Plant.surplus` → growth), and the nutrients new tissue
 * takes come out of the water and the bed where growth buys it (`drawTissue`).
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, monodUptake } from '../core/kinetics.js';
import {
  getCo2HalfSaturation,
  getSaturationIrradiance,
  type PlantSpecies,
} from '../plants/species.js';
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

/**
 * Calculate photosynthesis gas effects.
 *
 * Per-plant contribution, with m_i its rate units (`plants/canopy.ts`), PAR_i
 * the light at its mean leaf and sufficiency_i its Liebig sufficiency, both
 * index-aligned with `plants`:
 *   lightResponse_i = tanh(PAR_i / Ik_i), the species' saturating light curve
 *   carbon_i        = m_i × lightResponse_i × sufficiency_i × basePhotosynthesisRate × co2PerRateUnit
 *
 * Aggregate outputs, all masses in mg:
 *   co2    = monodUptake(CO2, Σ carbon_i, carbon-weighted mean of the species' CO₂ half-saturations, as mass)
 *   oxygen = co2 × CO2_TO_O2_MASS_RATIO
 */
export function calculatePhotosynthesis(
  plants: readonly Plant[],
  parByPlant: readonly number[],
  co2: number,
  waterVolume: number,
  sufficiencyByPlant: readonly number[],
  plantsConfig: PlantsConfig = plantsDefaults
): PhotosynthesisResult {
  let carbonCapacity = 0;
  let carbonHalfSaturationWeight = 0;
  plants.forEach((plant, i) => {
    const lightResponse = lightSaturationFactor(
      parByPlant[i],
      getSaturationIrradiance(plant.species, plantsConfig)
    );
    const carbon =
      rateUnits(plant) *
      lightResponse *
      sufficiencyByPlant[i] *
      plantsConfig.basePhotosynthesisRate *
      plantsConfig.co2PerRateUnit;
    carbonCapacity += carbon;
    carbonHalfSaturationWeight += carbon * getCo2HalfSaturation(plant.species, plantsConfig);
  });

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
