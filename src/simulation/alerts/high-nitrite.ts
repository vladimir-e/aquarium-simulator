/**
 * High nitrite alert.
 * Triggers once when nitrite level exceeds stress threshold (>0.1 ppm).
 * Resets when nitrite level drops below threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for high nitrite alert (0.1 ppm - stress level for fish) */
export const HIGH_NITRITE_THRESHOLD = 0.1;

export const highNitriteAlert: Alert = {
  id: 'high-nitrite',

  check(state: SimulationState): AlertResult {
    const nitriteLevel = state.resources.nitrite;
    const wasTriggered = state.alertState.highNitrite;

    // Check if currently above threshold
    const isAboveThreshold = nitriteLevel > HIGH_NITRITE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'nitrogen-cycle',
            'warning',
            `High nitrite level: ${nitriteLevel.toFixed(3)} ppm - tank still cycling. Monitor closely and perform water changes if needed.`
          ),
          alertState: { highNitrite: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { highNitrite: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { highNitrite: false } };
  },
};
