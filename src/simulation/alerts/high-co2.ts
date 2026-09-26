/**
 * High CO₂ alert — fires once when CO₂ crosses `HIGH_CO2_THRESHOLD`, resets
 * below it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { ceiled, latch } from './latch.js';

/** Dissolved CO₂ (mg/L) keepers treat as too much. */
export const HIGH_CO2_THRESHOLD = 40;

export const highCo2Alert: Alert = {
  id: 'high-co2',

  check(state: SimulationState): AlertResult {
    const co2 = state.resources.co2;
    return latch(
      state,
      'highCo2',
      co2 > HIGH_CO2_THRESHOLD,
      'gas-exchange',
      `High CO₂ level: ${ceiled(co2, 1)} mg/L - past the ${HIGH_CO2_THRESHOLD} mg/L keepers treat as too much`
    );
  },
};
