/**
 * High ammonia alert.
 * Triggers once when ammonia level exceeds stress threshold (>0.02 ppm).
 * Resets when ammonia level drops below threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for high ammonia alert (0.02 ppm - stress level for fish) */
export const HIGH_AMMONIA_THRESHOLD = 0.02;

export const highAmmoniaAlert: Alert = {
  id: 'high-ammonia',

  check(state: SimulationState): AlertResult {
    const ammoniaLevel = state.resources.ammonia;
    const wasTriggered = state.alertState.highAmmonia;

    // Check if currently above threshold
    const isAboveThreshold = ammoniaLevel > HIGH_AMMONIA_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'nitrogen-cycle',
            'warning',
            `High ammonia level: ${ammoniaLevel.toFixed(3)} ppm - toxic to fish. Add more filter media or reduce feeding.`
          ),
          alertState: { highAmmonia: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { highAmmonia: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { highAmmonia: false } };
  },
};
