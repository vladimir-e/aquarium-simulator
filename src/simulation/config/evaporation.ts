/**
 * Evaporation system tunable configuration.
 */

export interface EvaporationConfig {
  /** Base evaporation rate: fraction of water volume per day at thermal equilibrium */
  baseRatePerDay: number;
  /** Temperature increase (°C) for evaporation rate to double */
  tempDoublingInterval: number;
}

export const evaporationDefaults: EvaporationConfig = {
  baseRatePerDay: 0.01,
  tempDoublingInterval: 5.56,
};

export interface EvaporationConfigMeta {
  key: keyof EvaporationConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const evaporationConfigMeta: EvaporationConfigMeta[] = [
  { key: 'baseRatePerDay', label: 'Base Rate per Day', unit: '%', min: 0.005, max: 0.05, step: 0.005 },
  { key: 'tempDoublingInterval', label: 'Temp Doubling Interval', unit: '°C', min: 3, max: 15, step: 0.5 },
];
