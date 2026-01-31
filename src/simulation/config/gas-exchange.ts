/**
 * Gas exchange system tunable configuration.
 */

export interface GasExchangeConfig {
  /** Atmospheric CO2 equilibrium concentration (mg/L) */
  atmosphericCo2: number;
  /** Base O2 saturation at reference temperature (mg/L at 15°C) */
  o2SaturationBase: number;
  /** Change in saturation per °C (negative = less O2 as temp increases) */
  o2SaturationSlope: number;
  /** Reference temperature for saturation calculation (°C) */
  o2ReferenceTemp: number;
  /** Fraction of difference moved toward equilibrium per tick at optimal flow */
  baseExchangeRate: number;
  /** Tank turnovers per hour needed for maximum exchange rate */
  optimalFlowTurnover: number;

  // Aeration parameters
  /** Multiplier to gas exchange rate when aeration is active (stacks with flow) */
  aerationExchangeMultiplier: number;
  /** Direct O2 injection from bubble dissolution (mg/L per tick) */
  aerationDirectO2: number;
  /** Additional CO2 off-gassing multiplier when aerating (increases CO2 loss) */
  aerationCo2OffgasMultiplier: number;
}

export const gasExchangeDefaults: GasExchangeConfig = {
  atmosphericCo2: 4.0,
  o2SaturationBase: 8.5,
  o2SaturationSlope: -0.05,
  o2ReferenceTemp: 15,
  baseExchangeRate: 0.25,
  optimalFlowTurnover: 10,

  // Aeration defaults
  // Aeration roughly doubles gas exchange and adds small direct O2
  aerationExchangeMultiplier: 2.0,
  aerationDirectO2: 0.05, // Small direct injection (mg/L per hour)
  aerationCo2OffgasMultiplier: 1.5, // 50% faster CO2 off-gassing
};

export interface GasExchangeConfigMeta {
  key: keyof GasExchangeConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const gasExchangeConfigMeta: GasExchangeConfigMeta[] = [
  { key: 'atmosphericCo2', label: 'Atmospheric CO2', unit: 'mg/L', min: 1, max: 10, step: 0.5 },
  { key: 'o2SaturationBase', label: 'O2 Saturation Base', unit: 'mg/L', min: 6, max: 12, step: 0.5 },
  { key: 'o2SaturationSlope', label: 'O2 Saturation Slope', unit: 'mg/L/°C', min: -0.15, max: 0, step: 0.01 },
  { key: 'o2ReferenceTemp', label: 'O2 Reference Temp', unit: '°C', min: 10, max: 25, step: 1 },
  { key: 'baseExchangeRate', label: 'Base Exchange Rate', unit: '/tick', min: 0.05, max: 0.5, step: 0.05 },
  { key: 'optimalFlowTurnover', label: 'Optimal Flow Turnover', unit: 'x/hr', min: 2, max: 20, step: 1 },
  // Aeration tuning
  { key: 'aerationExchangeMultiplier', label: 'Aeration Exchange Mult', unit: 'x', min: 1.0, max: 4.0, step: 0.25 },
  { key: 'aerationDirectO2', label: 'Aeration Direct O2', unit: 'mg/L/hr', min: 0, max: 0.2, step: 0.01 },
  { key: 'aerationCo2OffgasMultiplier', label: 'Aeration CO2 Offgas Mult', unit: 'x', min: 1.0, max: 3.0, step: 0.25 },
];
