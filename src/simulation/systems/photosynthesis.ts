/**
 * Photosynthesis — plants and algae alike.
 *
 * Light and carbon set the photosynthate each flora is offered over the hour,
 * all of it drawn on the one CO₂ stock. What its reserve takes of that is fixed:
 * it draws its CO₂ and releases its O₂. What it burns — upkeep, the overhead
 * of building, repair, structure lost starving — releases the CO₂ back and
 * takes the O₂, on the same yield.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { CO2_TO_CH2O_MASS_RATIO, CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, monodUptake } from '../core/kinetics.js';
import { getCo2HalfSaturation, plantTraits, type PlantSpecies } from '../plants/species.js';
import { metabolicRateUnits, saturationIrradiance } from './flora.js';
import { getMassFromPpm } from '../resources/index.js';
import { rateUnits, sizeOf } from '../plants/canopy.js';

const MG_PER_G = 1000;

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
  metabolicRateUnits: number;
  /** `tanh(PAR / Ik)` at the light it stands in, 0–1. */
  lightResponse: number;
  /** Its oxygen pace, 0–1. */
  omega: number;
  /** Dissolved CO₂ (mg/L) it fixes at half rate on. */
  co2HalfSaturation: number;
}

/** A plant as photosynthesis reads it, at the PAR on its mean leaf: its vigour lifts the ceiling it fixes to. */
export function plantFixer(
  plant: Pick<Plant, 'species' | 'budget' | 'vigour'>,
  par: number,
  omega: number,
  config: PlantsConfig = plantsDefaults
): CarbonFixer {
  const traits = plantTraits(plant.species);
  return {
    metabolicRateUnits:
      (1 + plant.vigour) * metabolicRateUnits(rateUnits({ species: plant.species, size: sizeOf(plant) }), traits),
    lightResponse: lightSaturationFactor(par, saturationIrradiance(traits, config)),
    omega,
    co2HalfSaturation: getCo2HalfSaturation(plant.species, config),
  };
}

/**
 * mg of CO₂ each fixer is offered over the hour, in the order handed in, all
 * drawn on the one stock. Per fixer, with m_i its metabolic rate units:
 *
 *   carbon_i = m_i × lightResponse_i × ω_i × basePhotosynthesisRate × co2PerRateUnit
 *
 * and together they draw `monodUptake(CO₂, Σ carbon_i, carbon-weighted mean of
 * the CO₂ half-saturations, as mass)`, each its own share of it.
 */
export function offerCarbon(
  fixers: readonly CarbonFixer[],
  co2: number,
  waterVolume: number,
  plantsConfig: PlantsConfig = plantsDefaults
): number[] {
  const capacities = fixers.map(
    (fixer) =>
      fixer.metabolicRateUnits *
      fixer.lightResponse *
      fixer.omega *
      plantsConfig.basePhotosynthesisRate *
      plantsConfig.co2PerRateUnit
  );
  const capacity = capacities.reduce((sum, c) => sum + c, 0);
  if (capacity <= 0) return capacities.map(() => 0);
  const halfSaturation = capacities.reduce((sum, c, i) => sum + c * fixers[i].co2HalfSaturation, 0) / capacity;
  const drawn = monodUptake(getMassFromPpm(co2, waterVolume), capacity, getMassFromPpm(halfSaturation, waterVolume));
  return capacities.map((c) => (drawn * c) / capacity);
}

/** Grams of photosynthate this many mg of CO₂ fix into. */
export function photosynthateOf(co2: number): number {
  return (co2 * CO2_TO_CH2O_MASS_RATIO) / MG_PER_G;
}

/** mg of each gas grams of photosynthate fixed or burned moves. */
export interface CarbonGases {
  co2: number;
  oxygen: number;
}

export function carbonGases(grams: number): CarbonGases {
  const co2 = (grams * MG_PER_G) / CO2_TO_CH2O_MASS_RATIO;
  return { co2, oxygen: co2 * CO2_TO_O2_MASS_RATIO };
}
