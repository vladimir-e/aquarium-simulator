/**
 * Livestock system tunable configuration.
 *
 * Calibration targets:
 * - Metabolism: A 1g fish consumes ~0.01g food/hr, produces proportional waste/CO2
 * - Hunger: Increases ~4%/hr when unfed (full to starving in ~24hr)
 * - Health: Recovers ~1%/hr in ideal conditions, degrades faster under stress
 * - Death: 1% chance per tick after max age
 */

export interface LivestockConfig {
  // Metabolism
  /** Base food consumption rate per gram of fish mass per hour */
  baseFoodRate: number;
  /** Base oxygen consumption rate per gram of fish mass per hour (mg/L) */
  baseRespirationRate: number;
  /** Fraction of food consumed that becomes waste */
  wasteRatio: number;
  /** CO2 produced per unit oxygen consumed (respiratory quotient) */
  respiratoryQuotient: number;

  // Hunger
  /** Hunger increase per hour (percentage points) */
  hungerIncreaseRate: number;

  // Health
  /** Base health recovery per hour when no stressors (percentage points) */
  baseHealthRecovery: number;

  // Stressor severities (damage per hour per unit deviation)
  /** Health damage per °C outside safe temperature range */
  temperatureStressSeverity: number;
  /** Health damage per pH unit outside safe range */
  phStressSeverity: number;
  /** Health damage per ppm of ammonia */
  ammoniaStressSeverity: number;
  /** Health damage per ppm of nitrite */
  nitriteStressSeverity: number;
  /** Health damage per ppm of nitrate above 40 */
  nitrateStressSeverity: number;
  /** Health damage when hunger exceeds 50% (per % above 50) */
  hungerStressSeverity: number;
  /** Health damage per mg/L oxygen below 5 */
  oxygenStressSeverity: number;
  /** Health damage per % water below 50% capacity */
  waterLevelStressSeverity: number;
  /** Health damage per LPH of flow above species max */
  flowStressSeverity: number;

  // Death
  /** Fraction of fish mass added as waste on death */
  deathDecayFactor: number;
  /** Chance of death per tick when past max age (0-1) */
  oldAgeDeathChance: number;
}

export const livestockDefaults: LivestockConfig = {
  // Metabolism - a 1g fish eats ~0.01g/hr = 0.24g/day
  baseFoodRate: 0.01,
  baseRespirationRate: 0.02, // mg/L O2 per gram per hour
  wasteRatio: 0.3, // 30% of food consumed becomes waste
  respiratoryQuotient: 0.8, // CO2/O2 ratio

  // Hunger - increases ~0.6%/hr; fish can survive 3-7 days without food
  // Reaches 50% (stress threshold) in ~3.5 days, 100% in ~7 days
  hungerIncreaseRate: 0.6,

  // Health - recovers ~1%/hr = full recovery in ~100 hours if healthy
  baseHealthRecovery: 1.0,

  // Stressor severities
  temperatureStressSeverity: 2.0, // 2% damage per °C outside range per hour
  phStressSeverity: 3.0, // 3% damage per pH unit outside range per hour
  ammoniaStressSeverity: 50.0, // Very toxic - 50% damage at 1 ppm
  nitriteStressSeverity: 20.0, // Toxic - 20% damage at 1 ppm
  nitrateStressSeverity: 0.5, // Mild - 0.5% damage per ppm above 40
  hungerStressSeverity: 0.1, // 0.1% per % hunger above 50
  oxygenStressSeverity: 3.0, // 3% damage per mg/L below 5
  waterLevelStressSeverity: 0.2, // 0.2% per % below 50% capacity
  flowStressSeverity: 0.01, // 0.01% per LPH above species max

  // Death
  deathDecayFactor: 0.5, // Half fish mass becomes waste
  oldAgeDeathChance: 0.01, // 1% per tick after max age
};

export interface LivestockConfigMeta {
  key: keyof LivestockConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const livestockConfigMeta: LivestockConfigMeta[] = [
  // Metabolism
  { key: 'baseFoodRate', label: 'Base Food Rate', unit: 'g/g/hr', min: 0.001, max: 0.05, step: 0.001 },
  {
    key: 'baseRespirationRate',
    label: 'Base Respiration Rate',
    unit: 'mg/L/g/hr',
    min: 0.005,
    max: 0.1,
    step: 0.005,
  },
  { key: 'wasteRatio', label: 'Waste Ratio', unit: '', min: 0.1, max: 0.6, step: 0.05 },
  { key: 'respiratoryQuotient', label: 'Respiratory Quotient', unit: '', min: 0.5, max: 1.2, step: 0.1 },
  // Hunger
  { key: 'hungerIncreaseRate', label: 'Hunger Rate', unit: '%/hr', min: 0.1, max: 5, step: 0.1 },
  // Health
  { key: 'baseHealthRecovery', label: 'Health Recovery', unit: '%/hr', min: 0.1, max: 5, step: 0.1 },
  // Stressor severities
  {
    key: 'temperatureStressSeverity',
    label: 'Temp Stress Severity',
    unit: '%/°C/hr',
    min: 0.5,
    max: 10,
    step: 0.5,
  },
  { key: 'phStressSeverity', label: 'pH Stress Severity', unit: '%/pH/hr', min: 1, max: 10, step: 0.5 },
  {
    key: 'ammoniaStressSeverity',
    label: 'Ammonia Stress Severity',
    unit: '%/ppm/hr',
    min: 10,
    max: 100,
    step: 5,
  },
  {
    key: 'nitriteStressSeverity',
    label: 'Nitrite Stress Severity',
    unit: '%/ppm/hr',
    min: 5,
    max: 50,
    step: 5,
  },
  {
    key: 'nitrateStressSeverity',
    label: 'Nitrate Stress Severity',
    unit: '%/ppm/hr',
    min: 0.1,
    max: 2,
    step: 0.1,
  },
  { key: 'hungerStressSeverity', label: 'Hunger Stress', unit: '%/%/hr', min: 0.01, max: 0.5, step: 0.01 },
  {
    key: 'oxygenStressSeverity',
    label: 'O2 Stress Severity',
    unit: '%/mg/L/hr',
    min: 1,
    max: 10,
    step: 0.5,
  },
  {
    key: 'waterLevelStressSeverity',
    label: 'Water Level Stress',
    unit: '%/%/hr',
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    key: 'flowStressSeverity',
    label: 'Flow Stress Severity',
    unit: '%/LPH/hr',
    min: 0.001,
    max: 0.05,
    step: 0.001,
  },
  // Death
  { key: 'deathDecayFactor', label: 'Death Decay Factor', unit: '', min: 0.1, max: 1.0, step: 0.1 },
  { key: 'oldAgeDeathChance', label: 'Old Age Death Chance', unit: '/tick', min: 0.001, max: 0.05, step: 0.001 },
];
