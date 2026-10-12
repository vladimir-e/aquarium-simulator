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
import { CO2_TO_CH2O_MASS_RATIO, CO2_TO_O2_MASS_RATIO, MG_PER_G } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, stockLeft } from '../core/kinetics.js';
import { sum } from '../core/sum.js';
import { getCo2HalfSaturation, plantTraits } from '../plants/species.js';
import { metabolicRateUnits, saturationIrradiance } from './flora.js';
import { rateUnits, sizeOf } from '../plants/canopy.js';

/** One draw on the CO₂ stock over the hour: the mg it takes in water rich in carbon, and the dissolved CO₂ (mg/L) it takes half that on. */
export interface CarbonFixer {
  capacity: number;
  co2HalfSaturation: number;
}

/**
 * mg of CO₂ metabolic rate units fix over the hour in water rich in carbon, at
 * their light response `tanh(PAR / Ik)` and their oxygen pace:
 * `m × lightResponse × ω × basePhotosynthesisRate × co2PerRateUnit`.
 */
export function carbonCapacity(
  units: number,
  lightResponse: number,
  omega: number,
  plantsConfig: PlantsConfig = plantsDefaults
): number {
  return units * lightResponse * omega * plantsConfig.basePhotosynthesisRate * plantsConfig.co2PerRateUnit;
}

/** A plant as photosynthesis reads it, at the PAR on its mean leaf: its vigour lifts the ceiling it fixes to. */
export function plantFixer(
  plant: Pick<Plant, 'species' | 'budget' | 'vigour'>,
  par: number,
  omega: number,
  plantsConfig: PlantsConfig = plantsDefaults
): CarbonFixer {
  const traits = plantTraits(plant.species);
  return {
    capacity: carbonCapacity(
      (1 + plant.vigour) * metabolicRateUnits(rateUnits({ species: plant.species, size: sizeOf(plant) }), traits),
      lightSaturationFactor(par, saturationIrradiance(traits, plantsConfig)),
      omega,
      plantsConfig
    ),
    co2HalfSaturation: getCo2HalfSaturation(plant.species, plantsConfig),
  };
}

/**
 * mg of CO₂ each fixer is offered over the hour, in the order handed in, all
 * drawn on the one stock, each on its own Monod curve read at the CO₂ the hour
 * leaves.
 */
export function offerCarbon(fixers: readonly CarbonFixer[], co2: number, waterVolume: number): number[] {
  const offered = (level: number): number[] =>
    fixers.map(({ capacity, co2HalfSaturation }) => capacity * monodFactor(level, co2HalfSaturation));
  const left = waterVolume > 0 ? stockLeft(co2, (level) => sum(offered(level)) / waterVolume) : 0;
  return offered(left);
}

/** Grams of photosynthate this many mg of CO₂ fix into. */
export function photosynthateOf(co2: number): number {
  return (co2 * CO2_TO_CH2O_MASS_RATIO) / MG_PER_G;
}

/** mg of each gas grams of photosynthate fixed or burned moves. */
interface CarbonGases {
  co2: number;
  oxygen: number;
}

export function carbonGases(grams: number): CarbonGases {
  const co2 = (grams * MG_PER_G) / CO2_TO_CH2O_MASS_RATIO;
  return { co2, oxygen: co2 * CO2_TO_O2_MASS_RATIO };
}
