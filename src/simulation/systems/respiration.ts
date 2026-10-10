/**
 * The pace a flora's tissue lives at: every rate of its budget — what it
 * assimilates, mobilises and owes, and what its stores take up — runs on
 * respiration's Q10 off its reference temperature.
 */

import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { q10Factor } from '../core/kinetics.js';

/** Rate doubles every 10 °C above the reference at Q10 = 2, halves every 10 °C below. */
export function getRespirationTemperatureFactor(
  temperature: number,
  config: PlantsConfig = plantsDefaults
): number {
  return q10Factor(temperature, config.respirationQ10, config.respirationReferenceTemp);
}
