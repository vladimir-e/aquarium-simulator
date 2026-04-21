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
  // pH equilibrates with CO2/carbonic-acid on a time scale of minutes-to-hours
  // in a well-circulated tank. 0.25 per tick means ~75 % of the way to target
  // every three hours; matches scenario 02's observation that overnight pH
  // rebounds to 6.7–6.9 before the CO2 schedule starts again.
  basePgDriftRate: 0.25,
  // Logarithmic Henderson-Hasselbalch-style coupling (see
  // `systems/ph-drift.ts::calculateCO2PHEffect`). Coefficient is the pH
  // change per decade of CO2 change from neutral. 0.75 lands
  // pH ≈ 6.4 at 25 ppm CO2 and ≈ 6.8 at 5 ppm — matching scenario 02's
  // diurnal anchor points for a CO2-injected planted tank with ~2–3 dKH
  // water. The coefficient effectively replaces alkalinity in the
  // calculation: a higher-KH tank would need a smaller coefficient.
  co2PhCoefficient: 0.75,
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
  { key: 'co2PhCoefficient', label: 'CO2 pH Coefficient', unit: 'pH/decade', min: 0, max: 2.0, step: 0.05 },
  { key: 'co2NeutralLevel', label: 'CO2 Neutral Level', unit: 'mg/L', min: 2, max: 8, step: 0.5 },
  { key: 'hardscapeDiminishingFactor', label: 'Hardscape Diminishing Factor', unit: '', min: 0.4, max: 0.9, step: 0.05 },
];
