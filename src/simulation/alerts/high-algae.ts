/**
 * High algae alert.
 * Triggers once when algae level reaches 80+.
 * Resets when algae level drops below threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for high algae alert (80 out of 100) */
export const HIGH_ALGAE_THRESHOLD = 80;

export const highAlgaeAlert: Alert = {
  id: 'high-algae',

  check(state: SimulationState): AlertResult {
    const algaeLevel = state.resources.algae;
    const wasTriggered = state.alertState.highAlgae;

    // Check if currently at or above threshold
    const isAboveThreshold = algaeLevel >= HIGH_ALGAE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'algae',
            'warning',
            `High algae level: ${algaeLevel.toFixed(1)} - consider reducing light or scrubbing`
          ),
          alertState: { highAlgae: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { highAlgae: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { highAlgae: false } };
  },
};
