/**
 * High algae alert.
 * Triggers once when algae mass reaches 80+.
 * Resets when algae mass drops below threshold.
 *
 * Reads `state.algae.mass` directly — algae is no longer a resource
 * but a top-level organism with mass / condition / surplus.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for high algae alert (80 out of 100) */
export const HIGH_ALGAE_THRESHOLD = 80;

export const highAlgaeAlert: Alert = {
  id: 'high-algae',

  check(state: SimulationState): AlertResult {
    const algaeMass = state.algae.mass;
    const wasTriggered = state.alertState.highAlgae;

    // Check if currently at or above threshold
    const isAboveThreshold = algaeMass >= HIGH_ALGAE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'algae',
            'warning',
            `High algae level: ${algaeMass.toFixed(1)} - consider reducing light or scrubbing`
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
