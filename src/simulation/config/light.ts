/**
 * Light system tunable configuration — the water column's optical properties.
 */

export interface LightConfig {
  /**
   * Beer–Lambert attenuation coefficient of the water column, per cm of
   * depth. Clear freshwater in the 400–700 nm band loses roughly 1 %/cm.
   */
  waterAttenuationPerCm: number;
}

export const lightDefaults: LightConfig = {
  waterAttenuationPerCm: 0.010,
};

export interface LightConfigMeta {
  key: keyof LightConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const lightConfigMeta: LightConfigMeta[] = [
  {
    key: 'waterAttenuationPerCm',
    label: 'Water Attenuation',
    unit: '/cm',
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
];
