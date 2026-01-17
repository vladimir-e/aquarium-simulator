/**
 * Low oxygen alert.
 * Triggers once when oxygen level drops below critical threshold (< 4 mg/L).
 * Resets when oxygen level rises above threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for low oxygen alert (mg/L) */
export const LOW_OXYGEN_THRESHOLD = 4.0;

export const lowOxygenAlert: Alert = {
  id: 'low-oxygen',

  check(state: SimulationState): AlertResult {
    const oxygenLevel = state.resources.oxygen;
    const wasTriggered = state.alertState.lowOxygen;

    // Check if currently below threshold
    const isBelowThreshold = oxygenLevel < LOW_OXYGEN_THRESHOLD;

    if (isBelowThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'gas-exchange',
            'warning',
            `Low oxygen level: ${oxygenLevel.toFixed(1)} mg/L - critical for fish`
          ),
          alertState: { lowOxygen: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { lowOxygen: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { lowOxygen: false } };
  },
};
