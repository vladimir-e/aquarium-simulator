/**
 * Photosynthesis calculations for plants.
 *
 * Photosynthesis occurs when lights are on. It produces resource-layer
 * effects only — oxygen production, CO2 uptake, nutrient uptake. Plant
 * size growth flows through the surplus supply chain (vitality →
 * `Plant.surplus` → growth) and does NOT come from photosynthesis
 * output directly.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import type { Nutrient, NutrientsConfig, NutrientVector } from '../config/nutrients.js';
import { NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import type { Resources } from '../state.js';
import { CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';
import { lightSaturationFactor, monodFactor, monodUptake } from '../core/kinetics.js';
import {
  getCo2HalfSaturation,
  getSaturationIrradiance,
  type PlantSpecies,
} from '../plants/species.js';
import { getMassFromPpm } from '../resources/index.js';
import { speciesDemand, speciesHalfSaturation } from './nutrients.js';

/**
 * Per-plant precomputed Liebig sufficiency, keyed by plant id. The
 * orchestrator computes this once per tick and passes it to both
 * vitality and photosynthesis so the calculation isn't repeated.
 */
export type SufficiencyMap = ReadonlyMap<string, number>;

/**
 * mg of GH, as CaCO3, a plant takes up per mg of nitrate it draws. Leaf
 * tissue carries about a third as much calcium and a tenth as much magnesium
 * as nitrogen; converted to CaCO3 equivalents per mg of NO3, that is ~0.28.
 */
export const GH_PER_NITRATE_DRAWN = 0.28;

/** ppm of GH, as CaCO3, at which plants take calcium and magnesium at half their need. */
export const GH_HALF_SATURATION = 1;

export interface PhotosynthesisResult {
  /** Oxygen released (mg, absolute — caller divides by water volume for mg/L delta) */
  oxygenProducedMg: number;
  /** Carbon fixed (mg of CO2, absolute — caller divides by water volume for mg/L delta) */
  co2ConsumedMg: number;
  /** Nitrate consumed (mg, negative) */
  nitrateDelta: number;
  /** Phosphate consumed (mg, negative) */
  phosphateDelta: number;
  /** Potassium consumed (mg, negative) */
  potassiumDelta: number;
  /** Iron consumed (mg, negative) */
  ironDelta: number;
  /** Calcium and magnesium consumed (mg of CaCO3, negative) */
  ghDelta: number;
  /**
   * Effective limiting factor averaged across plants (0–1).
   * Useful for telemetry / tests. 0 = no photosynthesis, 1 = optimal.
   */
  limitingFactor: number;
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
 * Zero-valued photosynthesis result (for guard branches).
 */
function emptyResult(): PhotosynthesisResult {
  return {
    oxygenProducedMg: 0,
    co2ConsumedMg: 0,
    nitrateDelta: 0,
    phosphateDelta: 0,
    potassiumDelta: 0,
    ironDelta: 0,
    ghDelta: 0,
    limitingFactor: 0,
  };
}

/**
 * Calculate photosynthesis resource effects.
 *
 * Per-plant contribution:
 *   lightResponse_i = tanh(PAR / Ik_i), the species' saturating light curve
 *   co2Factor_i = CO2 / (K_i + CO2), the species' carbon Monod
 *   potential_i = size_i × co2Factor_i × lightResponse_i × basePhotosynthesisRate
 *   actual_i    = potential_i × sufficiency_i
 *
 * Aggregate outputs, all masses in mg:
 *   capacity_n = Σ potential_i × demand_i,n × uptakePerRateUnit_n
 *   K_n        = capacity-weighted mean of the plants' half-saturations, as mass
 *   uptake_n   = monodUptake(stock_n, capacity_n, K_n)
 *   gh         = monodUptake(GH, uptake_nitrate × GH_PER_NITRATE_DRAWN, GH_HALF_SATURATION)
 *   co2        = Σ actual × co2PerRateUnit, clamped to the dissolved mass
 *   oxygen     = co2 × CO2_TO_O2_MASS_RATIO
 */
export function calculatePhotosynthesis(
  plants: readonly Plant[],
  light: number,
  co2: number,
  resources: Resources,
  waterVolume: number,
  sufficiencyByPlantId: SufficiencyMap,
  plantsConfig: PlantsConfig = plantsDefaults,
  nutrientsConfig: NutrientsConfig = nutrientsDefaults
): PhotosynthesisResult {
  const totalSize = plants.reduce((s, p) => s + p.size, 0);

  if (totalSize <= 0 || waterVolume <= 0) {
    return emptyResult();
  }

  const zeros = (): NutrientVector =>
    Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as NutrientVector;
  const capacity = zeros();
  const weightedHalfSaturation = zeros();

  let potentialSum = 0;
  let actualSum = 0;

  for (const plant of plants) {
    if (plant.size <= 0) continue;
    const lightResponse = lightSaturationFactor(
      light,
      getSaturationIrradiance(plant.species, plantsConfig)
    );
    const co2Factor = calculateCo2Factor(co2, plant.species, plantsConfig);
    const potential =
      (plant.size / 100) * co2Factor * lightResponse * plantsConfig.basePhotosynthesisRate;
    potentialSum += potential;
    actualSum += potential * (sufficiencyByPlantId.get(plant.id) ?? 0);

    const demand = speciesDemand(plant.species, nutrientsConfig);
    for (const n of NUTRIENTS) {
      const need = potential * demand[n] * nutrientsConfig.uptakePerRateUnit[n];
      capacity[n] += need;
      weightedHalfSaturation[n] +=
        need * speciesHalfSaturation(plant.species, n, nutrientsConfig);
    }
  }

  const drawFrom = (n: Nutrient): number =>
    0 -
    monodUptake(
      resources[n],
      capacity[n],
      getMassFromPpm(weightedHalfSaturation[n] / capacity[n], waterVolume)
    );
  const nitrateDelta = drawFrom('nitrate');

  const co2ConsumedMg = Math.min(
    actualSum * plantsConfig.co2PerRateUnit,
    getMassFromPpm(co2, waterVolume)
  );

  return {
    oxygenProducedMg: co2ConsumedMg * CO2_TO_O2_MASS_RATIO,
    co2ConsumedMg,
    nitrateDelta,
    phosphateDelta: drawFrom('phosphate'),
    potassiumDelta: drawFrom('potassium'),
    ironDelta: drawFrom('iron'),
    ghDelta:
      0 -
      monodUptake(
        resources.gh,
        -nitrateDelta * GH_PER_NITRATE_DRAWN,
        getMassFromPpm(GH_HALF_SATURATION, waterVolume)
      ),
    limitingFactor: potentialSum > 0 ? actualSum / potentialSum : 0,
  };
}

/**
 * Get total plant size from an array of plants.
 */
export function getTotalPlantSize(
  plants: readonly { size: number }[]
): number {
  return plants.reduce((sum, plant) => sum + plant.size, 0);
}
