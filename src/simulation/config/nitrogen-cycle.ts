/**
 * Nitrogen cycle system tunable configuration.
 */

export interface NitrogenCycleConfig {
  /** Fraction of waste converted to ammonia per tick */
  wasteConversionRate: number;
  /** Conversion ratio: grams waste to mg ammonia */
  wasteToAmmoniaRatio: number;
  /** ppm processed per bacteria unit per tick */
  bacteriaProcessingRate: number;
  /** ppm ammonia to trigger AOB spawn */
  aobSpawnThreshold: number;
  /** ppm nitrite to trigger NOB spawn */
  nobSpawnThreshold: number;
  /** Initial bacteria when spawning */
  spawnAmount: number;
  /** AOB growth rate per tick */
  aobGrowthRate: number;
  /** NOB growth rate per tick */
  nobGrowthRate: number;
  /** Max bacteria per cm² surface */
  bacteriaPerCm2: number;
  /** Fraction of bacteria that die per tick without food */
  bacteriaDeathRate: number;
  /** Min ammonia (ppm) to sustain AOB */
  aobFoodThreshold: number;
  /** Min nitrite (ppm) to sustain NOB */
  nobFoodThreshold: number;
}

export const nitrogenCycleDefaults: NitrogenCycleConfig = {
  wasteConversionRate: 0.3,
  wasteToAmmoniaRatio: 1.0,
  bacteriaProcessingRate: 0.000002,
  aobSpawnThreshold: 0.02,
  nobSpawnThreshold: 0.125,
  spawnAmount: 10,
  aobGrowthRate: 0.03,
  nobGrowthRate: 0.05,
  bacteriaPerCm2: 0.01,
  bacteriaDeathRate: 0.02,
  aobFoodThreshold: 0.001,
  nobFoodThreshold: 0.001,
};

export interface NitrogenCycleConfigMeta {
  key: keyof NitrogenCycleConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const nitrogenCycleConfigMeta: NitrogenCycleConfigMeta[] = [
  { key: 'wasteConversionRate', label: 'Waste Conversion Rate', unit: '/tick', min: 0.1, max: 0.9, step: 0.05 },
  { key: 'wasteToAmmoniaRatio', label: 'Waste to Ammonia Ratio', unit: 'mg/g', min: 0.1, max: 5, step: 0.1 },
  { key: 'bacteriaProcessingRate', label: 'Bacteria Processing Rate', unit: 'ppm/unit', min: 0.000001, max: 0.00001, step: 0.000001 },
  { key: 'aobSpawnThreshold', label: 'AOB Spawn Threshold', unit: 'ppm', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'nobSpawnThreshold', label: 'NOB Spawn Threshold', unit: 'ppm', min: 0.05, max: 0.5, step: 0.025 },
  { key: 'spawnAmount', label: 'Spawn Amount', unit: '', min: 1, max: 50, step: 1 },
  { key: 'aobGrowthRate', label: 'AOB Growth Rate', unit: '/tick', min: 0.01, max: 0.1, step: 0.01 },
  { key: 'nobGrowthRate', label: 'NOB Growth Rate', unit: '/tick', min: 0.01, max: 0.15, step: 0.01 },
  { key: 'bacteriaPerCm2', label: 'Max Bacteria per cm²', unit: '/cm²', min: 0.001, max: 0.1, step: 0.001 },
  { key: 'bacteriaDeathRate', label: 'Bacteria Death Rate', unit: '/tick', min: 0.005, max: 0.1, step: 0.005 },
  { key: 'aobFoodThreshold', label: 'AOB Food Threshold', unit: 'ppm', min: 0.0001, max: 0.01, step: 0.0001 },
  { key: 'nobFoodThreshold', label: 'NOB Food Threshold', unit: 'ppm', min: 0.0001, max: 0.01, step: 0.0001 },
];
