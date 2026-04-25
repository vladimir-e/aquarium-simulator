/**
 * Photosynthesis calculations for plants.
 *
 * Photosynthesis occurs when lights are on. It produces resource-layer
 * effects only — oxygen production, CO2 uptake, nutrient uptake. Plant
 * size growth flows through the surplus supply chain (vitality →
 * `Plant.surplus` → growth) and does NOT come from photosynthesis
 * output directly. Photosynthesis health (the Liebig-gated rate) shows
 * up upstream as the nutrient-deficiency stressor on vitality, which
 * gates surplus, which gates growth — no double-counting.
 *
 * - Consumes CO2, light, and plant macronutrients (NO3, PO4, K, Fe)
 * - Produces oxygen
 * - Nutrient uptake runs at the *potential* rate (size × light × CO2) — plants
 *   draw nutrients from the water column even when one nutrient caps growth
 *   (real aquatic plants transpire and accumulate at rates driven by bulk
 *   photosynthetic drive, not by their internal use efficiency)
 *
 * Stoichiometry (overall):
 *   6CO2 + 6H2O + nutrients + light → C6H12O6 + 6O2
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import type { NutrientsConfig, FertilizerFormula } from '../config/nutrients.js';
import { nutrientsDefaults, getNutrientRatio } from '../config/nutrients.js';
import type { Resources } from '../state.js';
import { getDemandMultiplier } from './nutrients.js';

/**
 * Per-plant precomputed Liebig sufficiency, keyed by plant id. The
 * orchestrator computes this once per tick and passes it to both
 * vitality and photosynthesis so the calculation isn't repeated.
 */
export type SufficiencyMap = ReadonlyMap<string, number>;

export interface PhotosynthesisResult {
  /** Oxygen produced (mg/L) */
  oxygenDelta: number;
  /** CO2 consumed (mg/L, negative) */
  co2Delta: number;
  /** Nitrate consumed (mg, negative) */
  nitrateDelta: number;
  /** Phosphate consumed (mg, negative) */
  phosphateDelta: number;
  /** Potassium consumed (mg, negative) */
  potassiumDelta: number;
  /** Iron consumed (mg, negative) */
  ironDelta: number;
  /**
   * Effective limiting factor averaged across plants (0–1).
   * Useful for telemetry / tests. 0 = no photosynthesis, 1 = optimal.
   */
  limitingFactor: number;
}

/**
 * Calculate CO2 limiting factor for photosynthesis.
 * Returns 0-1 where 1 = optimal conditions.
 */
export function calculateCo2Factor(
  co2: number,
  config: PlantsConfig = plantsDefaults
): number {
  if (co2 <= 0) return 0;
  return Math.min(1, co2 / config.optimalCo2);
}

/**
 * Zero-valued photosynthesis result (for guard branches).
 */
function emptyResult(): PhotosynthesisResult {
  return {
    oxygenDelta: 0,
    co2Delta: 0,
    nitrateDelta: 0,
    phosphateDelta: 0,
    potassiumDelta: 0,
    ironDelta: 0,
    limitingFactor: 0,
  };
}

/**
 * Calculate photosynthesis resource effects.
 *
 * Per-plant contribution:
 *   potential_i = size_i × co2Factor (driven by light/CO2/size only)
 *   actual_i    = potential_i × sufficiency_i × basePhotosynthesisRate
 *
 * Aggregate outputs:
 *   uptake   = Σ potential_i × basePhotosynthesisRate × nutrientsPerPhotosynthesis
 *              (split by fertilizer formula ratio across the 4 nutrients;
 *              not gated by sufficiency — plants draw what they pull in)
 *   oxygen   = actual × o2PerPhotosynthesis (released only when plants are
 *              actually photosynthesizing — Liebig-gated rate)
 *   co2      = actual × co2PerPhotosynthesis (same gate as oxygen)
 *
 * @param plants            Individual plants (for per-species Liebig gating)
 * @param light             Current light output (watts, 0 when off)
 * @param co2               Current CO2 concentration (mg/L)
 * @param resources         Full resource state (for the uptake clamping)
 * @param waterVolume       Tank water volume (L)
 * @param sufficiencyByPlantId  Precomputed Liebig sufficiency per plant id
 * @param plantsConfig      Plants configuration
 * @param nutrientsConfig   Nutrients configuration (thresholds + formula)
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

  if (light <= 0 || totalSize <= 0 || waterVolume <= 0) {
    return emptyResult();
  }

  const co2Factor = calculateCo2Factor(co2, plantsConfig);
  if (co2Factor <= 0) return emptyResult();

  // Pre-compute fertilizer ratios once
  const formula: FertilizerFormula = nutrientsConfig.fertilizerFormula;
  const nitrateRatio = getNutrientRatio('nitrate', formula);
  const phosphateRatio = getNutrientRatio('phosphate', formula);
  const potassiumRatio = getNutrientRatio('potassium', formula);
  const ironRatio = getNutrientRatio('iron', formula);

  let potentialSum = 0; // drives uptake + O2/CO2 scale
  let weightedSufficiency = 0;

  for (const plant of plants) {
    if (plant.size <= 0) continue;
    const potential = (plant.size / 100) * co2Factor;
    potentialSum += potential;
    // Sufficiency is precomputed by the orchestrator. Default to 0 for
    // plants the caller hasn't supplied (defensive — should not happen
    // in production paths).
    const sufficiency = sufficiencyByPlantId.get(plant.id) ?? 0;
    weightedSufficiency += potential * sufficiency;
  }

  // Potential photosynthesis (in "rate units", 1 = 100% plant × optimal light/CO2)
  const potentialRate = potentialSum * plantsConfig.basePhotosynthesisRate;
  // Actual photosynthesis (post-Liebig). Drives O2 release, CO2 fixation,
  // and the active-biomass component of nutrient draw.
  const actualRate = weightedSufficiency * plantsConfig.basePhotosynthesisRate;

  // Nutrient uptake — tied to actual photosynthesis (Liebig-gated) plus a
  // small "maintenance draw" from potential rate. This keeps consumption
  // proportional to what plants actually build (so demand doesn't outrun
  // dose at high biomass) while still depleting the water column when
  // one nutrient caps growth (Variant B: plants keep trickling NO3 and PO4
  // down even with zero K/Fe, matching scenario 02 expectations).
  const UPTAKE_MAINTENANCE_FRACTION = 0.2;
  const totalNutrientDraw =
    (actualRate + potentialRate * UPTAKE_MAINTENANCE_FRACTION) *
    plantsConfig.nutrientsPerPhotosynthesis;

  // Proposed per-nutrient draw (mg). Clamp each to available mass so we never
  // go negative. Negate at the end — use a helper to avoid -0 artifacts.
  const drawFrom = (ratio: number, available: number): number => {
    const draw = Math.min(totalNutrientDraw * ratio, Math.max(0, available));
    return draw > 0 ? -draw : 0;
  };
  const nitrateDelta = drawFrom(nitrateRatio, resources.nitrate);
  const phosphateDelta = drawFrom(phosphateRatio, resources.phosphate);
  const potassiumDelta = drawFrom(potassiumRatio, resources.potassium);
  const ironDelta = drawFrom(ironRatio, resources.iron);

  // O2/CO2 deltas scale with actual (Liebig-gated) rate: plants only release
  // oxygen and fix carbon when they're actually photosynthesizing.
  const oxygenDelta = actualRate * plantsConfig.o2PerPhotosynthesis;
  const co2Delta = -actualRate * plantsConfig.co2PerPhotosynthesis;

  const limitingFactor = potentialSum > 0 ? weightedSufficiency / potentialSum : 0;

  return {
    oxygenDelta,
    co2Delta,
    nitrateDelta,
    phosphateDelta,
    potassiumDelta,
    ironDelta,
    limitingFactor,
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

// Re-export helper used in tests to stay compatible.
export { getDemandMultiplier };
