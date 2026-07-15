/**
 * Algae population tunable configuration.
 *
 * First-pass values aim for **mechanism correctness**, not ecological
 * accuracy. The numbers below produce the right qualitative shapes
 * (heavy plants suppress algae; pure-light tank with no plants and no
 * dosing accumulates algae via excess-light alone; hostile conditions
 * shrink mass directly) — full calibration follows Task 42 in a
 * recalibration pass.
 *
 * Severities are pre-hardiness; `computeAlgaePopulation` multiplies
 * by `(1 - hardiness)` centrally. Algae has a single `hardiness`
 * value (no per-species variation yet) — pick it modestly so a single
 * full-grown plant does not zero out the bloom path.
 */

import { SURPLUS_CAP_DEFAULT } from './vitality.js';

export interface AlgaeVitalityConfig {
  /** Hardiness 0–1 — multiplied centrally by `computeAlgaePopulation`. */
  hardiness: number;

  // Stressors --------------------------------------------------------

  /**
   * Plant-power threshold above which suppression activates.
   * Power = Σ (plant.size/100) × (plant.condition/100). One full-
   * grown thriving plant contributes 1.0; the threshold of 1.0 means
   * a single healthy plant just starts pushing algae back.
   */
  suppressionThreshold: number;
  /**
   * Damage rate per unit of plant power above the suppression
   * threshold. Tuned so a moderate planted tank (power ~3.0)
   * delivers ~0.4 %/h pre-hardiness — enough to push condition
   * below 100 in a few sim hours.
   */
  plantSuppressionSeverity: number;

  // Benefits ---------------------------------------------------------

  /**
   * W/L threshold above which excess light boosts algae. Set roughly
   * above where most plants saturate — below the threshold light is
   * "what plants are using" and algae gets nothing.
   */
  lightExcessThreshold: number;
  /**
   * Peak benefit (%/h) from excess light. Capped: the function is
   * `min(peak, severity × (wpl - threshold))`.
   */
  excessLightPeak: number;
  /**
   * Severity multiplier on (wpl - lightExcessThreshold) before the
   * peak cap is applied.
   */
  excessLightSeverity: number;

  /**
   * Peak benefit (%/h) from excess nutrients above plant optimum.
   * "Excess" is the larger of the NO3 and PO4 ratios above optimum;
   * scaled by severity then capped at peak. Should dominate the
   * nutrient lever (decline-driven boost flows mostly through
   * `low_plant_power`, but excess nutrients are the headline in a
   * dosed tank).
   */
  excessNutrientPeak: number;
  /**
   * Severity multiplier on the (ratio - 1) excess before peak cap.
   * 1.0 means a 2× over-optimum nutrient pool gives full peak.
   */
  excessNutrientSeverity: number;

  /**
   * Peak benefit (%/h) from nutrient deficiency. Intentionally small —
   * the canary signalling "plants are starving, algae moves in" —
   * most of the decline-driven boost should flow through
   * `low_plant_power`. Both channels stay visible in the breakdown
   * so the player reads the signals separately.
   */
  nutrientDeficiencyPeak: number;
  /**
   * Severity multiplier on the (1 - ratio) deficit before peak cap.
   */
  nutrientDeficiencySeverity: number;

  /**
   * Plant-power threshold below which `low_plant_power` activates.
   * Mirror-image of `suppressionThreshold`; the deadband between the
   * two leaves a quiet zone where neither factor fires.
   */
  weaknessThreshold: number;
  /**
   * Peak benefit (%/h) from low plant power.
   */
  lowPlantPowerPeak: number;
  /**
   * Severity multiplier on (weaknessThreshold - power) before peak
   * cap.
   */
  lowPlantPowerSeverity: number;

  // Mass dynamics ----------------------------------------------------

  /**
   * Max surplus units the bloom can spend on mass growth in one
   * tick. Caps a long-banked surplus from suddenly dumping into a
   * single tick of growth. Mirrors `plantGrowthPerTickCap`.
   */
  algaeGrowthPerTickCap: number;

  /**
   * Mass gained per surplus unit drained, before the asymptotic
   * factor. Mirrors `sizePerSurplus` in the plant-growth knob.
   */
  massPerSurplus: number;

  /**
   * Saturation cap for the surplus reserve bank. Suppression drains the
   * bank before mass shrinks; accrual (photoperiod-gated) saturates
   * here. Shared default across organism types — see `SURPLUS_CAP_DEFAULT`.
   */
  surplusCap: number;
}

export const algaeVitalityDefaults: AlgaeVitalityConfig = {
  hardiness: 0.4, // Moderate — algae is reasonably tough, not invincible.

  suppressionThreshold: 1.0,
  plantSuppressionSeverity: 0.2,

  lightExcessThreshold: 0.5, // W/L
  excessLightPeak: 0.4,
  excessLightSeverity: 0.2,

  excessNutrientPeak: 0.4,
  excessNutrientSeverity: 0.4,

  nutrientDeficiencyPeak: 0.05,
  nutrientDeficiencySeverity: 0.1,

  weaknessThreshold: 0.3,
  lowPlantPowerPeak: 0.2,
  lowPlantPowerSeverity: 0.4,

  algaeGrowthPerTickCap: 2.0,
  massPerSurplus: 0.5,

  surplusCap: SURPLUS_CAP_DEFAULT,
};

export interface AlgaeVitalityConfigMeta {
  key: keyof AlgaeVitalityConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const algaeVitalityConfigMeta: AlgaeVitalityConfigMeta[] = [
  { key: 'hardiness', label: 'Algae Hardiness', unit: '', min: 0, max: 1, step: 0.05 },
  // Stressors
  { key: 'suppressionThreshold', label: 'Suppression Threshold', unit: 'power', min: 0, max: 5, step: 0.1 },
  { key: 'plantSuppressionSeverity', label: 'Plant Suppression Severity', unit: '%/power/hr', min: 0, max: 1, step: 0.05 },
  // Benefits
  { key: 'lightExcessThreshold', label: 'Light Excess Threshold', unit: 'W/L', min: 0, max: 2, step: 0.05 },
  { key: 'excessLightPeak', label: 'Excess Light Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'excessLightSeverity', label: 'Excess Light Severity', unit: '%/(W/L)/hr', min: 0, max: 1, step: 0.05 },
  { key: 'excessNutrientPeak', label: 'Excess Nutrient Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'excessNutrientSeverity', label: 'Excess Nutrient Severity', unit: '%/ratio/hr', min: 0, max: 2, step: 0.05 },
  { key: 'nutrientDeficiencyPeak', label: 'Nutrient Deficiency Peak', unit: '%/hr', min: 0, max: 0.5, step: 0.01 },
  { key: 'nutrientDeficiencySeverity', label: 'Nutrient Deficiency Severity', unit: '%/(1-ratio)/hr', min: 0, max: 1, step: 0.05 },
  { key: 'weaknessThreshold', label: 'Weakness Threshold', unit: 'power', min: 0, max: 2, step: 0.05 },
  { key: 'lowPlantPowerPeak', label: 'Low Plant Power Peak', unit: '%/hr', min: 0, max: 1, step: 0.05 },
  { key: 'lowPlantPowerSeverity', label: 'Low Plant Power Severity', unit: '%/power/hr', min: 0, max: 2, step: 0.05 },
  // Mass dynamics
  { key: 'algaeGrowthPerTickCap', label: 'Algae Growth per Tick Cap', unit: 'surplus', min: 0.1, max: 10, step: 0.1 },
  { key: 'massPerSurplus', label: 'Mass per Surplus', unit: '%', min: 0.05, max: 2, step: 0.05 },
  { key: 'surplusCap', label: 'Surplus Cap', unit: '%', min: 0, max: 100, step: 5 },
];
