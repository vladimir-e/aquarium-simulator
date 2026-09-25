/**
 * Water chemistry tunable configuration — the rates that move alkalinity.
 */

export interface WaterChemistryConfig {
  /** mg of CaCO3 one calcite rock dissolves per hour at pH 7 */
  calciteDissolutionRate: number;
  /** Fraction of a driftwood piece's remaining tannins leached per hour */
  tanninLeachRate: number;
  /** Fraction of the tank's alkalinity a fresh aqua soil bed takes up per hour */
  aquaSoilKhUptake: number;
}

export const waterChemistryDefaults: WaterChemistryConfig = {
  calciteDissolutionRate: 20,
  tanninLeachRate: 0.0003,
  aquaSoilKhUptake: 0.01,
};

export interface WaterChemistryConfigMeta {
  key: keyof WaterChemistryConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const waterChemistryConfigMeta: WaterChemistryConfigMeta[] = [
  { key: 'calciteDissolutionRate', label: 'Calcite Dissolution', unit: 'mg/h', min: 0, max: 200, step: 1 },
  { key: 'tanninLeachRate', label: 'Tannin Leach', unit: '/h', min: 0, max: 0.01, step: 0.0001 },
  { key: 'aquaSoilKhUptake', label: 'Aqua Soil KH Uptake', unit: '/h', min: 0, max: 0.1, step: 0.005 },
];
