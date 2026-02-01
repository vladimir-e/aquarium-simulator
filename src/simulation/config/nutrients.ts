/**
 * Nutrients system tunable configuration.
 *
 * Calibration targets:
 * - Fertilizer: 1ml provides ~1 day of nutrients for moderate plant load
 * - Condition recovery: ~2-5% per tick when thriving
 * - Condition decay: ~1-3% per tick when starving
 * - Low-tech balance: Fish waste provides 50-70% of low-demand plant needs
 * - Overdose margin: 2-3x optimal before algae significantly benefits
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

  // Condition thresholds (sufficiency levels)
  /** Sufficiency above this = thriving (condition improves) */
  thrivingThreshold: number;
  /** Sufficiency above this = adequate (slight recovery) */
  adequateThreshold: number;
  /** Sufficiency above this = struggling (slow decay) */
  strugglingThreshold: number;
  // Below struggling threshold = starving (rapid decay)

  // Condition rates (per tick)
  /** Condition recovery rate when thriving (% per tick) */
  conditionRecoveryRate: number;
  /** Condition decay rate when starving (% per tick) */
  conditionDecayRate: number;

  // Shedding and death
  /** Condition below this triggers shedding */
  sheddingConditionThreshold: number;
  /** Maximum shedding rate (fraction of size per tick at condition 0) */
  maxSheddingRate: number;
  /** Waste produced per unit of shed size */
  wastePerShedSize: number;
  /** Condition below this = plant death */
  deathConditionThreshold: number;
  /** Size below this = plant death (%) */
  deathSizeThreshold: number;
  /** Waste produced when plant dies (per % size) */
  wastePerPlantDeath: number;

  // Decay phosphate production
  /** Phosphate produced per gram of decayed mass (mg/g) */
  phosphatePerDecay: number;

  // Nutrient consumption
  /** Base nutrient consumption rate per 100% plant size per hour */
  baseConsumptionRate: number;
}

export const nutrientsDefaults: NutrientsConfig = {
  // Fertilizer formula - balanced all-in-one
  fertilizerFormula: {
    nitrate: 5.0, // mg per ml
    phosphate: 0.5, // mg per ml
    potassium: 2.0, // mg per ml
    iron: 0.1, // mg per ml
  },

  // Optimal thresholds (ppm) - typical planted tank targets
  optimalNitratePpm: 15.0, // 10-20 ppm range, center at 15
  optimalPhosphatePpm: 1.0, // 0.5-2 ppm range
  optimalPotassiumPpm: 10.0, // 5-20 ppm range
  optimalIronPpm: 0.2, // 0.1-0.5 ppm range

  // Demand multipliers - low-demand plants can survive on less
  lowDemandMultiplier: 0.3, // 30% of optimal
  mediumDemandMultiplier: 0.6, // 60% of optimal
  highDemandMultiplier: 1.0, // Full optimal needed

  // Condition thresholds - relaxed for user margin
  thrivingThreshold: 0.8, // 80%+ sufficiency = thriving
  adequateThreshold: 0.5, // 50%+ = adequate
  strugglingThreshold: 0.2, // 20%+ = struggling
  // Below 20% = starving

  // Condition rates - gradual changes give warning
  conditionRecoveryRate: 3.0, // 3% per tick when thriving
  conditionDecayRate: 2.0, // 2% per tick when starving

  // Shedding and death - forgiving thresholds
  sheddingConditionThreshold: 30, // Shedding starts at condition < 30%
  maxSheddingRate: 0.02, // 2% size loss per tick at condition 0
  wastePerShedSize: 0.005, // 0.005g waste per % size shed
  deathConditionThreshold: 10, // Death at condition < 10%
  deathSizeThreshold: 10, // Death if size < 10%
  wastePerPlantDeath: 0.01, // 0.01g waste per % size when dying

  // Decay phosphate - links fish waste to plant nutrition
  phosphatePerDecay: 50, // 50 mg phosphate per gram decayed (trace amount)

  // Nutrient consumption - scales with plant size
  baseConsumptionRate: 0.1, // mg total nutrients per 100% plant size per hour
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
  { key: 'nitrate', label: 'Nitrate per ml', unit: 'mg', min: 1, max: 20, step: 0.5 },
  { key: 'phosphate', label: 'Phosphate per ml', unit: 'mg', min: 0.1, max: 5, step: 0.1 },
  { key: 'potassium', label: 'Potassium per ml', unit: 'mg', min: 0.5, max: 10, step: 0.5 },
  { key: 'iron', label: 'Iron per ml', unit: 'mg', min: 0.01, max: 1, step: 0.01 },
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

  // Condition thresholds
  { key: 'thrivingThreshold', label: 'Thriving Threshold', unit: '', min: 0.6, max: 1.0, step: 0.05 },
  { key: 'adequateThreshold', label: 'Adequate Threshold', unit: '', min: 0.3, max: 0.7, step: 0.05 },
  { key: 'strugglingThreshold', label: 'Struggling Threshold', unit: '', min: 0.1, max: 0.4, step: 0.05 },

  // Condition rates
  { key: 'conditionRecoveryRate', label: 'Condition Recovery Rate', unit: '%/hr', min: 0.5, max: 10, step: 0.5 },
  { key: 'conditionDecayRate', label: 'Condition Decay Rate', unit: '%/hr', min: 0.5, max: 10, step: 0.5 },

  // Shedding and death
  { key: 'sheddingConditionThreshold', label: 'Shedding Threshold', unit: '%', min: 10, max: 50, step: 5 },
  { key: 'maxSheddingRate', label: 'Max Shedding Rate', unit: '/hr', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'wastePerShedSize', label: 'Waste per Shed Size', unit: 'g/%', min: 0.001, max: 0.05, step: 0.001 },
  { key: 'deathConditionThreshold', label: 'Death Condition Threshold', unit: '%', min: 5, max: 20, step: 1 },
  { key: 'deathSizeThreshold', label: 'Death Size Threshold', unit: '%', min: 5, max: 20, step: 1 },
  { key: 'wastePerPlantDeath', label: 'Waste per Plant Death', unit: 'g/%', min: 0.001, max: 0.05, step: 0.001 },

  // Decay phosphate
  { key: 'phosphatePerDecay', label: 'Phosphate per Decay', unit: 'mg/g', min: 10, max: 200, step: 10 },

  // Consumption
  { key: 'baseConsumptionRate', label: 'Base Consumption Rate', unit: 'mg/hr', min: 0.01, max: 1, step: 0.01 },
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
