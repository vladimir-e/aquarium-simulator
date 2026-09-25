/**
 * Water chemistry tunable configuration — the rates that move alkalinity.
 */

export interface WaterChemistryConfig {
  /** mg of CaCO3 one calcite rock dissolves per hour at pH 7 */
  calciteDissolutionRate: number;
  /** mg of CaCO3 one piece of driftwood's tannic acid neutralises per hour */
  driftwoodAcidRate: number;
  /** Fraction of the tank's alkalinity an active aqua soil bed takes up per hour */
  aquaSoilKhUptake: number;
}

export const waterChemistryDefaults: WaterChemistryConfig = {
  calciteDissolutionRate: 20,
  driftwoodAcidRate: 1,
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
  { key: 'driftwoodAcidRate', label: 'Driftwood Acid', unit: 'mg/h', min: 0, max: 20, step: 0.5 },
  { key: 'aquaSoilKhUptake', label: 'Aqua Soil KH Uptake', unit: '/h', min: 0, max: 0.1, step: 0.005 },
];
