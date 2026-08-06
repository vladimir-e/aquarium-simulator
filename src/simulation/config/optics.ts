/**
 * The water column's optical properties — what light loses on the way down,
 * as distinct from the fixture that emits it.
 */

export interface OpticsConfig {
  /**
   * Beer–Lambert attenuation coefficient of the water column, per cm of
   * depth. Clear freshwater in the 400–700 nm band loses roughly 1 %/cm.
   */
  waterAttenuationPerCm: number;
}

export const opticsDefaults: OpticsConfig = {
  waterAttenuationPerCm: 0.010,
};

/**
 * Zero is water that takes nothing — the clear-water limit, and meaningful.
 * One takes 63 % of the PAR in the first centimetre, which is no longer water
 * a tank holds. A coefficient outside [0, 1] is a typo, and a negative one is
 * worse than a typo: it turns Beer–Lambert into gain and the light infinite.
 */
export const MAX_WATER_ATTENUATION_PER_CM = 1;

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
];
