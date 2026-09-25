/**
 * Nutrients tunable configuration: what the fertilizer carries, what plants
 * take and how hard each species leans on the water column for it, and the
 * minerals that ride with nitrogen out of mineralized waste.
 */

import type { NutrientDemand } from '../plants/species.js';

export const NUTRIENTS = ['nitrate', 'phosphate', 'potassium', 'iron'] as const;

export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientVector = Record<Nutrient, number>;

export const WASTE_NUTRIENTS = ['phosphate', 'potassium', 'iron'] as const;

export type WasteNutrient = (typeof WASTE_NUTRIENTS)[number];

export type WasteRelease = Record<WasteNutrient, number>;

/** Nutrients provided per 1 ml of all-in-one fertilizer, mg. */
export type FertilizerFormula = NutrientVector;

export interface NutrientsConfig {
  fertilizerFormula: FertilizerFormula;
  /**
   * mg a full-demand plant takes of each nutrient per rate unit of
   * photosynthetic drive — the tissue that one rate unit of carbon builds.
   */
  uptakePerRateUnit: NutrientVector;
  /** ppm at which a full-demand plant's uptake and sufficiency run at half. */
  halfSaturation: NutrientVector;
  /**
   * Share of a full-demand plant's need, per nutrient, for each species tier.
   * It scales both the uptake and the half-saturation.
   */
  demand: Record<NutrientDemand, NutrientVector>;
  /** Minerals released alongside the ammonia, per gram of waste (mg/g). */
  releasePerWaste: WasteRelease;
}

export const nutrientsDefaults: NutrientsConfig = {
  // 5ml in 40L: NO3 6.25ppm, PO4 0.625ppm, K 5ppm, Fe 0.125ppm
  fertilizerFormula: {
    nitrate: 50.0,
    phosphate: 5.0,
    potassium: 40.0,
    iron: 1.0,
  },

  // One rate unit fixes 30 mg CO₂, about 20 mg of dry tissue at 40 % carbon.
  // Macrophyte tissue runs ~3 % N, ~0.5 % P, 2–4 % K and a few hundred ppm Fe;
  // as the ions the water holds that is the vector below, rounded generous.
  uptakePerRateUnit: {
    nitrate: 3.0,
    phosphate: 0.3,
    potassium: 1.5,
    iron: 0.03,
  },

  // A tenth or so of the ppm hobbyists dose a high-tech tank to, so a carpet
  // at 15 NO₃ / 1 PO₄ / 10 K / 0.2 Fe reads ~90 % on every one.
  halfSaturation: {
    nitrate: 2.0,
    phosphate: 0.1,
    potassium: 1.0,
    iron: 0.02,
  },

  demand: {
    low: { nitrate: 0.3, phosphate: 0.3, potassium: 0.05, iron: 0.05 },
    medium: { nitrate: 0.6, phosphate: 0.6, potassium: 0.15, iron: 0.15 },
    high: { nitrate: 1, phosphate: 1, potassium: 1, iron: 1 },
  },

  // Waste is 5 % N (`wasteToAmmoniaRatio`). Fish food and the organic matter
  // it becomes carry N:P ≈ 7 by mass (~20 mg PO₄/g), about 1 % K and a few
  // hundred ppm Fe.
  releasePerWaste: {
    phosphate: 20,
    potassium: 8,
    iron: 0.2,
  },
};

export interface NutrientVectorMeta {
  key: Nutrient;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const fertilizerFormulaMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrate per ml', unit: 'mg', min: 1, max: 100, step: 1 },
  { key: 'phosphate', label: 'Phosphate per ml', unit: 'mg', min: 0.1, max: 10, step: 0.1 },
  { key: 'potassium', label: 'Potassium per ml', unit: 'mg', min: 0.5, max: 80, step: 1 },
  { key: 'iron', label: 'Iron per ml', unit: 'mg', min: 0.01, max: 2, step: 0.01 },
];

export const uptakeMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrate uptake', unit: 'mg/rate unit', min: 0.5, max: 10, step: 0.1 },
  { key: 'phosphate', label: 'Phosphate uptake', unit: 'mg/rate unit', min: 0.02, max: 2, step: 0.01 },
  { key: 'potassium', label: 'Potassium uptake', unit: 'mg/rate unit', min: 0.1, max: 5, step: 0.1 },
  { key: 'iron', label: 'Iron uptake', unit: 'mg/rate unit', min: 0.001, max: 0.2, step: 0.001 },
];

export const halfSaturationMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrate half-saturation', unit: 'ppm', min: 0.1, max: 10, step: 0.1 },
  { key: 'phosphate', label: 'Phosphate half-saturation', unit: 'ppm', min: 0.01, max: 1, step: 0.01 },
  { key: 'potassium', label: 'Potassium half-saturation', unit: 'ppm', min: 0.1, max: 5, step: 0.1 },
  { key: 'iron', label: 'Iron half-saturation', unit: 'ppm', min: 0.001, max: 0.2, step: 0.001 },
];

export const demandMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrate demand', unit: '× full', min: 0.01, max: 1, step: 0.01 },
  { key: 'phosphate', label: 'Phosphate demand', unit: '× full', min: 0.01, max: 1, step: 0.01 },
  { key: 'potassium', label: 'Potassium demand', unit: '× full', min: 0.01, max: 1, step: 0.01 },
  { key: 'iron', label: 'Iron demand', unit: '× full', min: 0.01, max: 1, step: 0.01 },
];

export const releasePerWasteMeta: NutrientVectorMeta[] = [
  { key: 'phosphate', label: 'Phosphate per waste', unit: 'mg/g', min: 0, max: 100, step: 1 },
  { key: 'potassium', label: 'Potassium per waste', unit: 'mg/g', min: 0, max: 50, step: 0.5 },
  { key: 'iron', label: 'Iron per waste', unit: 'mg/g', min: 0, max: 2, step: 0.01 },
];
