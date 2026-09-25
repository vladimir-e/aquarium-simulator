/**
 * High nitrate alert.
 * Triggers once when nitrate crosses the line where it starts to harm fish.
 * Resets when nitrate level drops below threshold.
 *
 * Nitrate is stored as mass (mg), so ppm is derived from mass/water.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import { HIGH_NITRATE_THRESHOLD } from '../livestock/tolerance.js';

export const highNitrateAlert: Alert = {
  id: 'high-nitrate',

  check(state: SimulationState): AlertResult {
    // Derive ppm from mass (mg) and water (L)
    const nitratePpm = getPpm(state.resources.nitrate, state.resources.water);
    const wasTriggered = state.alertState.highNitrate;

    // Check if currently above threshold
    const isAboveThreshold = nitratePpm > HIGH_NITRATE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'nitrogen-cycle',
            'warning',
            `High nitrate level: ${nitratePpm.toFixed(1)} ppm - consider water change`
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
