/**
 * Temperature drift system tunable configuration.
 */

export interface TemperatureConfig {
  /** Cooling coefficient: °C/hr per °C differential at reference volume */
  coolingCoefficient: number;
  /** Reference volume in liters for scaling calculations */
  referenceVolume: number;
  /** Volume scaling exponent (surface-area-to-volume ratio) */
  volumeExponent: number;
}

export const temperatureDefaults: TemperatureConfig = {
  coolingCoefficient: 0.132,
  referenceVolume: 100,
  volumeExponent: 1 / 3,
};

export interface TemperatureConfigMeta {
  key: keyof TemperatureConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const temperatureConfigMeta: TemperatureConfigMeta[] = [
  { key: 'coolingCoefficient', label: 'Cooling Coefficient', unit: '°C/hr/°C', min: 0.05, max: 0.3, step: 0.01 },
  { key: 'referenceVolume', label: 'Reference Volume', unit: 'L', min: 20, max: 500, step: 10 },
  { key: 'volumeExponent', label: 'Volume Exponent', unit: '', min: 0.1, max: 0.5, step: 0.05 },
];
