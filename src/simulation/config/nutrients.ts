/**
 * Nutrients system tunable configuration.
 *
 * Calibration targets:
 * - Fertilizer: Supplements fish waste; consumption is slow (0.1 mg/hr per 100% plants)
 *   At 100% plant coverage, 1ml (96mg) lasts ~40 days; primary nutrients come from waste
 * - Low-tech balance: Fish waste provides 50-70% of low-demand plant needs
 * - Overdose margin: 2-3x optimal before algae significantly benefits
 *
 * Plant condition is now driven by `systems/plant-vitality.ts` against
 * `plantsConfig` (vitality benefit/damage rates per factor); this file
 * only controls nutrient demand and the shedding/death thresholds.
 */

/**
 * Fertilizer formula - nutrients provided per 1ml of all-in-one fertilizer.
 * Plants consume nutrients in this same ratio.
 */
export interface FertilizerFormula {
  /** Nitrate mg per ml */
  nitrate: number;
  /** Phosphate mg per ml */
  phosphate: number;
  /** Potassium mg per ml */
  potassium: number;
  /** Iron mg per ml */
  iron: number;
}

export interface NutrientsConfig {
  // Fertilizer formula (mg per ml)
  /** Fertilizer composition - nutrients per ml */
  fertilizerFormula: FertilizerFormula;

  // Optimal nutrient thresholds (ppm)
  /** Optimal nitrate concentration (ppm) - target for planted tanks */
  optimalNitratePpm: number;
  /** Optimal phosphate concentration (ppm) */
  optimalPhosphatePpm: number;
  /** Optimal potassium concentration (ppm) */
  optimalPotassiumPpm: number;
  /** Optimal iron concentration (ppm) */
  optimalIronPpm: number;

  // Demand multipliers by plant demand level
  /** Low-demand plants need this fraction of optimal (0.3 = 30%) */
  lowDemandMultiplier: number;
  /** Medium-demand plants need this fraction of optimal */
  mediumDemandMultiplier: number;
  /** High-demand plants need full optimal */
  highDemandMultiplier: number;

  // Decay phosphate production
  /** Phosphate produced per gram of decayed mass (mg/g) */
  phosphatePerDecay: number;
}

export const nutrientsDefaults: NutrientsConfig = {
  // Fertilizer formula - concentrated all-in-one
  // 5ml in 40L: NO3 6.25ppm (42%), PO4 0.625ppm (63%), K 5ppm (50%), Fe 0.125ppm (63%)
  fertilizerFormula: {
    nitrate: 50.0, // mg per ml (5ml/40L = 6.25 ppm, 42% of 15ppm optimal)
    phosphate: 5.0, // mg per ml (5ml/40L = 0.625 ppm, 63% of 1ppm optimal)
    potassium: 40.0, // mg per ml (5ml/40L = 5 ppm, 50% of 10ppm optimal)
    iron: 1.0, // mg per ml (5ml/40L = 0.125 ppm, 63% of 0.2ppm optimal)
  },

  // Optimal thresholds (ppm) — tuned so a well-run planted tank with the
  // default fertilizer formula reaches thriving sufficiency for high-
  // demand species at realistic dose rates. Values at the low end of the
  // literature ranges; hobbyists see plants thrive well before hitting
  // these, and the engine caps sufficiency at 1.0 so excess has no effect.
  optimalNitratePpm: 15.0, // 10-20 ppm range, center at 15
  optimalPhosphatePpm: 1.0, // 0.5-2 ppm range
  optimalPotassiumPpm: 7.0,  // 5-20 real range; lowered so Variant A MC thrives on 40 mg/day K dose
  optimalIronPpm: 0.15,      // 0.1-0.5 real range; lowered to the same band

  // Demand multipliers - low-demand plants can survive on less
  lowDemandMultiplier: 0.3, // 30% of optimal
  mediumDemandMultiplier: 0.6, // 60% of optimal
  highDemandMultiplier: 1.0, // Full optimal needed

  // Decay phosphate - links fish waste to plant nutrition
  // Organic matter contains ~0.1-1% phosphorus; 50mg/g represents mineralized PO4
  // from bacterial decomposition, providing ~5% of plant phosphate needs from waste
  phosphatePerDecay: 50, // mg phosphate per gram decayed

};

export interface NutrientsConfigMeta {
  key: keyof NutrientsConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

// Note: fertilizerFormula is nested, so we provide separate meta for its fields
export interface FertilizerFormulaMeta {
  key: keyof FertilizerFormula;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const fertilizerFormulaMeta: FertilizerFormulaMeta[] = [
  { key: 'nitrate', label: 'Nitrate per ml', unit: 'mg', min: 1, max: 100, step: 1 },
  { key: 'phosphate', label: 'Phosphate per ml', unit: 'mg', min: 0.1, max: 10, step: 0.1 },
  { key: 'potassium', label: 'Potassium per ml', unit: 'mg', min: 0.5, max: 80, step: 1 },
  { key: 'iron', label: 'Iron per ml', unit: 'mg', min: 0.01, max: 2, step: 0.01 },
];

export const nutrientsConfigMeta: NutrientsConfigMeta[] = [
  // Optimal thresholds
  { key: 'optimalNitratePpm', label: 'Optimal Nitrate', unit: 'ppm', min: 5, max: 30, step: 1 },
  { key: 'optimalPhosphatePpm', label: 'Optimal Phosphate', unit: 'ppm', min: 0.1, max: 5, step: 0.1 },
  { key: 'optimalPotassiumPpm', label: 'Optimal Potassium', unit: 'ppm', min: 2, max: 30, step: 1 },
  { key: 'optimalIronPpm', label: 'Optimal Iron', unit: 'ppm', min: 0.05, max: 1, step: 0.05 },

  // Demand multipliers
  { key: 'lowDemandMultiplier', label: 'Low Demand Multiplier', unit: '', min: 0.1, max: 0.5, step: 0.05 },
  { key: 'mediumDemandMultiplier', label: 'Medium Demand Multiplier', unit: '', min: 0.4, max: 0.8, step: 0.05 },
  { key: 'highDemandMultiplier', label: 'High Demand Multiplier', unit: '', min: 0.8, max: 1.0, step: 0.05 },

  // Decay phosphate
  { key: 'phosphatePerDecay', label: 'Phosphate per Decay', unit: 'mg/g', min: 10, max: 200, step: 10 },
];

/**
 * Helper function to get total nutrients from fertilizer formula.
 */
export function getTotalFertilizerNutrients(formula: FertilizerFormula): number {
  return formula.nitrate + formula.phosphate + formula.potassium + formula.iron;
}

/**
 * Get nutrient ratio for a specific nutrient (used for proportional consumption).
 */
export function getNutrientRatio(
  nutrient: keyof FertilizerFormula,
  formula: FertilizerFormula = nutrientsDefaults.fertilizerFormula
): number {
  const total = getTotalFertilizerNutrients(formula);
  if (total === 0) return 0;
  return formula[nutrient] / total;
}
