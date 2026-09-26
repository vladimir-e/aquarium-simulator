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
import { rateUnits } from '../plants/canopy.js';

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
 * Per-plant contribution, with m_i its rate units (`plants/canopy.ts`) and
 * PAR_i the light at its mean leaf:
 *   lightResponse_i = tanh(PAR_i / Ik_i), the species' saturating light curve
 *   co2Factor_i = CO2 / (K_i + CO2), the species' carbon Monod
 *   potential_i = m_i × co2Factor_i × lightResponse_i × basePhotosynthesisRate
 *   actual_i    = potential_i × sufficiency_i
 *   carbon_i    = m_i × lightResponse_i × sufficiency_i × basePhotosynthesisRate × co2PerRateUnit
 *
 * Aggregate outputs, all masses in mg:
 *   capacity_n = Σ potential_i × demand_i,n × uptakePerRateUnit_n
 *   K_n        = capacity-weighted mean of the plants' half-saturations, as mass
 *   uptake_n   = monodUptake(stock_n, capacity_n, K_n)
 *   gh         = monodUptake(GH, uptake_nitrate × GH_PER_NITRATE_DRAWN, GH_HALF_SATURATION as mass)
 *   co2        = monodUptake(CO2, Σ carbon_i, carbon-weighted mean of the species' CO₂ half-saturations, as mass)
 *   oxygen     = co2 × CO2_TO_O2_MASS_RATIO
 */
export function calculatePhotosynthesis(
  plants: readonly Plant[],
  parByPlant: readonly number[],
  co2: number,
  resources: Resources,
  waterVolume: number,
  sufficiencyByPlantId: SufficiencyMap,
  plantsConfig: PlantsConfig = plantsDefaults,
  nutrientsConfig: NutrientsConfig = nutrientsDefaults
): PhotosynthesisResult {
  if (waterVolume <= 0) {
    return emptyResult();
  }

  const zeros = (): NutrientVector =>
    Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as NutrientVector;
  const capacity = zeros();
  const halfSaturationWeight = zeros();
  let carbonCapacity = 0;
  let carbonHalfSaturationWeight = 0;

  let potentialSum = 0;
  let actualSum = 0;

  plants.forEach((plant, i) => {
    const lightResponse = lightSaturationFactor(
      parByPlant[i],
      getSaturationIrradiance(plant.species, plantsConfig)
    );
    const sufficiency = sufficiencyByPlantId.get(plant.id) ?? 0;
    const drive = rateUnits(plant) * lightResponse * plantsConfig.basePhotosynthesisRate;
    const potential = drive * calculateCo2Factor(co2, plant.species, plantsConfig);
    potentialSum += potential;
    actualSum += potential * sufficiency;

    const carbon = drive * sufficiency * plantsConfig.co2PerRateUnit;
    carbonCapacity += carbon;
    carbonHalfSaturationWeight += carbon * getCo2HalfSaturation(plant.species, plantsConfig);

    const demand = speciesDemand(plant.species, nutrientsConfig);
    for (const n of NUTRIENTS) {
      const need = potential * demand[n] * nutrientsConfig.uptakePerRateUnit[n];
      capacity[n] += need;
      halfSaturationWeight[n] += need * speciesHalfSaturation(plant.species, n, nutrientsConfig);
    }
  });

  const draw = (stock: number, cap: number, weight: number): number =>
    pooledUptake(stock, cap, weight, waterVolume);
  const drawFrom = (n: Nutrient): number =>
    draw(resources[n], capacity[n], halfSaturationWeight[n]);
  const nitrateDrawn = drawFrom('nitrate');
  const ghCapacity = nitrateDrawn * GH_PER_NITRATE_DRAWN;
  const co2ConsumedMg = draw(
    getMassFromPpm(co2, waterVolume),
    carbonCapacity,
    carbonHalfSaturationWeight
  );

  return {
    oxygenProducedMg: co2ConsumedMg * CO2_TO_O2_MASS_RATIO,
    co2ConsumedMg,
    nitrateDelta: drawdown(nitrateDrawn),
    phosphateDelta: drawdown(drawFrom('phosphate')),
    potassiumDelta: drawdown(drawFrom('potassium')),
    ironDelta: drawdown(drawFrom('iron')),
    ghDelta: drawdown(draw(resources.gh, ghCapacity, ghCapacity * GH_HALF_SATURATION)),
    limitingFactor: potentialSum > 0 ? actualSum / potentialSum : 0,
  };
}

/**
 * One Monod draw for a whole planting: `halfSaturationWeight` is Σ capacity_i × K_i
 * in ppm, so the pooled half-saturation is its capacity-weighted mean.
 */
function pooledUptake(
  stock: number,
  capacity: number,
  halfSaturationWeight: number,
  waterVolume: number
): number {
  if (capacity <= 0) return 0;
  return monodUptake(stock, capacity, getMassFromPpm(halfSaturationWeight / capacity, waterVolume));
}

function drawdown(uptake: number): number {
  return uptake > 0 ? -uptake : 0;
}
