/**
 * High CO₂ alert — fires once when CO₂ crosses `HIGH_CO2_THRESHOLD`, resets
 * below it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Dissolved CO₂ (mg/L) keepers treat as too much. */
export const HIGH_CO2_THRESHOLD = 40;

export const highCo2Alert: Alert = {
  id: 'high-co2',

  check(state: SimulationState): AlertResult {
    const co2Level = state.resources.co2;
    const wasTriggered = state.alertState.highCo2;

    // Check if currently above threshold
    const isAboveThreshold = co2Level > HIGH_CO2_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'gas-exchange',
            'warning',
            `High CO2 level: ${co2Level.toFixed(1)} mg/L - past the ${HIGH_CO2_THRESHOLD} mg/L keepers treat as too much`
          ),
          alertState: { highCo2: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { highCo2: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { highCo2: false } };
  },
};
