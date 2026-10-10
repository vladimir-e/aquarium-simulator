/**
 * What light loses on the way down — to the water column, the blooms in it and
 * on the leaves, and the leaves above — as distinct from the fixture that
 * emits it.
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
  /** Beer–Lambert extinction a bloom suspended in the column adds at full coverage, per cm of depth. */
  algaeAttenuationPerCm: number;
  /** Beer–Lambert optical depth of a full coat of bloom on a lit surface: where it covers, it passes e^(−depth). */
  algaeCoatOpticalDepth: number;
}

export const opticsDefaults: OpticsConfig = {
  waterAttenuationPerCm: 0.010,
  leafAttenuationPerLai: 0.7,
  // A bloom takes light by its coverage, the keeper's reading of it, as it
  // fixes and burns by its coverage: light per % and gas flux per % are both
  // anchored there, and grams are what the budget sees, so a kind's tissue
  // density moves with its pace and its optics do not. Phytoplankton take
  // about 0.02 m² per mg of chlorophyll, and chlorophyll is about 1 % of their
  // organic matter, so 2,000–3,000 cm² a gram of what a reader sees: a full
  // column is heavy green water's 30 mg/L of dry cells, 0.09 /cm, and a full
  // coat a green film's 0.3 mg/cm², an optical depth of 0.9 that passes 41 %.
  algaeAttenuationPerCm: 0.09,
  algaeCoatOpticalDepth: 0.9,
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

/**
 * Chlorophyll at its absorption peak, at the most of it a cell carries, takes
 * about 12,000 cm² a gram: 0.36 /cm through a full column, an optical depth of
 * 3.6 through a full coat. Past about twice those a coefficient is a typo; a
 * negative one turns a bloom into a light source.
 */
export const MAX_ALGAE_ATTENUATION_PER_CM = 0.75;
export const MAX_ALGAE_COAT_OPTICAL_DEPTH = 7.5;

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
  {
    key: 'algaeAttenuationPerCm',
    label: 'Algae Attenuation',
    unit: '/cm at full coverage',
    min: 0,
    max: 0.3,
    step: 0.005,
  },
  {
    key: 'algaeCoatOpticalDepth',
    label: 'Algae Coat Depth',
    unit: 'per full coat',
    min: 0,
    max: 3,
    step: 0.05,
  },
];
