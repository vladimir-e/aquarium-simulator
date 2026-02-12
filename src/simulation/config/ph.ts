/**
 * pH drift system tunable configuration.
 */

export interface PhConfig {
  /** pH target for calcite rock (pushes pH up) */
  calciteTargetPh: number;
  /** pH target for driftwood (pushes pH down) */
  driftwoodTargetPh: number;
  /** Neutral pH when no hardscape present */
  neutralPh: number;
  /** Base drift rate (fraction toward target per tick) */
  basePgDriftRate: number;
  /** pH change per mg/L CO2 above neutral */
  co2PhCoefficient: number;
  /** CO2 level at atmospheric equilibrium (no pH effect) */
  co2NeutralLevel: number;
  /** Diminishing returns factor for multiple hardscape items */
  hardscapeDiminishingFactor: number;
}

export const phDefaults: PhConfig = {
  calciteTargetPh: 8.0,
  driftwoodTargetPh: 6.0,
  neutralPh: 7.0,
  basePgDriftRate: 0.08,
  // Linear approximation: (30-4) * -0.05 = -1.3 pH at 30 ppm CO2.
  // Real relationship is logarithmic (Henderson-Hasselbalch); linear is acceptable
  // for the 4-40 ppm range typical in planted tanks.
  co2PhCoefficient: -0.05,
  co2NeutralLevel: 4.0,
  hardscapeDiminishingFactor: 0.7,
};

export interface PhConfigMeta {
  key: keyof PhConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const phConfigMeta: PhConfigMeta[] = [
  { key: 'calciteTargetPh', label: 'Calcite Target pH', unit: '', min: 7.5, max: 9, step: 0.1 },
  { key: 'driftwoodTargetPh', label: 'Driftwood Target pH', unit: '', min: 5, max: 7, step: 0.1 },
  { key: 'neutralPh', label: 'Neutral pH', unit: '', min: 6.5, max: 7.5, step: 0.1 },
  { key: 'basePgDriftRate', label: 'Base pH Drift Rate', unit: '/tick', min: 0.01, max: 0.2, step: 0.01 },
  { key: 'co2PhCoefficient', label: 'CO2 pH Coefficient', unit: 'pH/(mg/L)', min: -0.1, max: 0, step: 0.005 },
  { key: 'co2NeutralLevel', label: 'CO2 Neutral Level', unit: 'mg/L', min: 2, max: 8, step: 0.5 },
  { key: 'hardscapeDiminishingFactor', label: 'Hardscape Diminishing Factor', unit: '', min: 0.4, max: 0.9, step: 0.05 },
];
