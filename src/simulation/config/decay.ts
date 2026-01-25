/**
 * Decay system tunable configuration.
 */

export interface DecayConfig {
  /** Q10 temperature coefficient (rate doubles every 10°C) */
  q10: number;
  /** Reference temperature for decay rate (°C) */
  referenceTemp: number;
  /** Base decay rate at reference temperature (fraction per hour) */
  baseDecayRate: number;
  /** Fraction of decaying food that becomes solid waste */
  wasteConversionRatio: number;
  /** Gas exchange per gram of organic matter oxidized (mg per gram) */
  gasExchangePerGramDecay: number;
}

export const decayDefaults: DecayConfig = {
  q10: 2.0,
  referenceTemp: 25.0,
  baseDecayRate: 0.05,
  wasteConversionRatio: 0.4,
  gasExchangePerGramDecay: 250,
};

export interface DecayConfigMeta {
  key: keyof DecayConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const decayConfigMeta: DecayConfigMeta[] = [
  { key: 'q10', label: 'Q10 Temperature Coefficient', unit: '', min: 1, max: 4, step: 0.1 },
  { key: 'referenceTemp', label: 'Reference Temperature', unit: '°C', min: 15, max: 35, step: 1 },
  { key: 'baseDecayRate', label: 'Base Decay Rate', unit: '/hr', min: 0.01, max: 0.2, step: 0.01 },
  { key: 'wasteConversionRatio', label: 'Waste Conversion Ratio', unit: '', min: 0.1, max: 0.9, step: 0.1 },
  { key: 'gasExchangePerGramDecay', label: 'CO2/O2 per Gram Decay', unit: 'mg/g', min: 50, max: 500, step: 10 },
];
