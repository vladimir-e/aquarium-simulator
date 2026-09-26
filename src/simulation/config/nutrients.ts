/**
 * Nutrients tunable configuration: what the fertilizer and a root tab carry,
 * how fast the bed gives its store up to the water, how hard each species
 * leans on a pool, and the minerals in a gram of organic matter — the fish
 * food, the waste it becomes and plant tissue alike.
 */

import type { NutrientDemand } from '../plants/species.js';

export const NUTRIENTS = ['nitrate', 'phosphate', 'potassium', 'iron'] as const;

export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientVector = Record<Nutrient, number>;

export function mapNutrients(value: (n: Nutrient) => number): NutrientVector {
  return Object.fromEntries(NUTRIENTS.map((n) => [n, value(n)])) as NutrientVector;
}

export const ZERO_NUTRIENTS: Readonly<NutrientVector> = Object.freeze(mapNutrients(() => 0));

export const WASTE_NUTRIENTS = ['phosphate', 'potassium', 'iron'] as const;

export type WasteNutrient = (typeof WASTE_NUTRIENTS)[number];

export type MineralVector = Record<WasteNutrient, number>;

/** Nutrients provided per 1 ml of all-in-one fertilizer, mg. */
export type FertilizerFormula = NutrientVector;

export interface NutrientsConfig {
  fertilizerFormula: FertilizerFormula;
  /** mg of each nutrient one root tab pushes into the bed. */
  rootTab: NutrientVector;
  /** Share of each nutrient the bed holds that leaks into the water per hour. */
  bedLeakRate: number;
  /** ppm at which a full-demand plant's draw and sufficiency run at half. */
  halfSaturation: NutrientVector;
  /**
   * Share of a full-demand plant's need, per nutrient, for each species tier:
   * it scales the half-saturation, so a lean species makes do on thinner water.
   */
  demand: Record<NutrientDemand, NutrientVector>;
  /**
   * mg of each mineral in a gram of food, in the waste it becomes and in plant
   * tissue. Its nitrogen is `livestock.foodNitrogenFraction`.
   */
  foodMineralContent: MineralVector;
}

export const nutrientsDefaults: NutrientsConfig = {
  // 5ml in 40L: NO3 6.25ppm, PO4 0.625ppm, K 5ppm, Fe 0.125ppm
  fertilizerFormula: {
    nitrate: 50.0,
    phosphate: 5.0,
    potassium: 40.0,
    iron: 1.0,
  },

  // A gel cap of controlled-release pellets: about 90 mg N, 20 mg P, 200 mg K
  // and 10 mg Fe — heavy on potassium and iron beside the water column's
  // all-in-one, with nitrogen and phosphorus enough to feed a sword's roots.
  rootTab: {
    nitrate: 400,
    phosphate: 60,
    potassium: 200,
    iron: 10,
  },

  // A half-life of about five months: soil and tabs give their store up
  // slowly, and a keeper re-tabs every month or two.
  bedLeakRate: 0.0002,

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

  // Against its 5 % N, fish food carries N:P ≈ 7 by mass (~20 mg PO₄/g) —
  // Redfield, so the same recipe serves plant tissue — about 1 % K and a few
  // hundred ppm Fe.
  foodMineralContent: {
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

export interface NutrientsConfigMeta {
  key: keyof NutrientsConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const nutrientsConfigMeta: NutrientsConfigMeta[] = [
  { key: 'bedLeakRate', label: 'Bed Leak Rate', unit: '/hr', min: 0, max: 0.01, step: 0.0001 },
];

export const rootTabMeta: NutrientVectorMeta[] = [
  { key: 'nitrate', label: 'Nitrate per tab', unit: 'mg', min: 0, max: 2000, step: 10 },
  { key: 'phosphate', label: 'Phosphate per tab', unit: 'mg', min: 0, max: 500, step: 5 },
  { key: 'potassium', label: 'Potassium per tab', unit: 'mg', min: 0, max: 1000, step: 10 },
  { key: 'iron', label: 'Iron per tab', unit: 'mg', min: 0, max: 50, step: 0.5 },
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

export const foodMineralContentMeta: NutrientVectorMeta[] = [
  { key: 'phosphate', label: 'Phosphate in food', unit: 'mg/g', min: 0, max: 100, step: 1 },
  { key: 'potassium', label: 'Potassium in food', unit: 'mg/g', min: 0, max: 50, step: 0.5 },
  { key: 'iron', label: 'Iron in food', unit: 'mg/g', min: 0, max: 2, step: 0.01 },
];
