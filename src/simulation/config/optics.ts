/**
 * What light loses on the way down — to the water column and to the leaves
 * above — as distinct from the fixture that emits it.
 */

export interface OpticsConfig {
  /**
   * Beer–Lambert attenuation coefficient of the water column, per cm of
   * depth. Clear freshwater in the 400–700 nm band loses roughly 1 %/cm.
   */
  waterAttenuationPerCm: number;
  /**
   * Beer–Lambert extinction per unit of leaf area index — what a canopy takes
   * from the light below it. Broad-leaved canopies run 0.6–0.8 (Monsi & Saeki);
   * zero is leaves that shade nothing, and light at height is the water's alone.
   */
  leafAttenuationPerLai: number;
}

export const opticsDefaults: OpticsConfig = {
  waterAttenuationPerCm: 0.010,
  leafAttenuationPerLai: 0.7,
};

/**
 * Zero is water that takes nothing — the clear-water limit, and meaningful.
 * One takes 63 % of the PAR in the first centimetre, which is no longer water
 * a tank holds. A coefficient outside [0, 1] is a typo, and a negative one is
 * worse than a typo: it turns Beer–Lambert into gain and the light infinite.
 */
export const MAX_WATER_ATTENUATION_PER_CM = 1;

/**
 * Flat, opaque leaves facing an overhead lamp take the most: each layer of leaf
 * area passes e⁻¹ of the light, k = 1. Past twice that a coefficient is a typo,
 * and a runaway one overflows a small crown's self-shade relief to infinite light.
 */
export const MAX_LEAF_ATTENUATION_PER_LAI = 2;

export interface OpticsConfigMeta {
  key: keyof OpticsConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const opticsConfigMeta: OpticsConfigMeta[] = [
  {
    key: 'waterAttenuationPerCm',
    label: 'Water Attenuation',
    unit: '/cm',
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
  {
    key: 'leafAttenuationPerLai',
    label: 'Leaf Attenuation',
    unit: '/LAI',
    min: 0,
    max: 1.2,
    step: 0.05,
  },
];
