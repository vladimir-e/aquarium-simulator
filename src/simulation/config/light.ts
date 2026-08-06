/**
 * Light system tunable configuration.
 *
 * The fixture is rated in PAR at the water surface; what the tank runs on is
 * PAR at the substrate. The gap between the two is the water column, and this
 * config holds its optical properties.
 */

export interface LightConfig {
  /**
   * Beer–Lambert attenuation coefficient of the water column, per cm of
   * depth. Clear freshwater in the 400–700 nm band loses roughly 1 %/cm,
   * which costs a 20 L about a fifth of its surface PAR by the substrate
   * and a 300 L about two fifths.
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
