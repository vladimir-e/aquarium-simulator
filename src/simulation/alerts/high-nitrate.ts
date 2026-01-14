/**
 * High nitrate alert.
 * Triggers once when nitrate level exceeds action threshold (>20 ppm).
 * Resets when nitrate level drops below threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for high nitrate alert (20 ppm - action needed) */
export const HIGH_NITRATE_THRESHOLD = 20;

export const highNitrateAlert: Alert = {
  id: 'high-nitrate',

  check(state: SimulationState): AlertResult {
    const nitrateLevel = state.resources.nitrate;
    const wasTriggered = state.alertState.highNitrate;

    // Check if currently above threshold
    const isAboveThreshold = nitrateLevel > HIGH_NITRATE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'nitrogen-cycle',
            'warning',
            `Nitrate accumulation: ${nitrateLevel.toFixed(1)} ppm - perform water change or add plants to consume nitrate.`
          ),
          alertState: { highNitrate: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { highNitrate: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { highNitrate: false } };
  },
};
