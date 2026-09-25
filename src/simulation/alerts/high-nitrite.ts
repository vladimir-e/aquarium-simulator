/**
 * High nitrite alert.
 * Triggers once when nitrite crosses the line where it starts to harm fish.
 * Resets when nitrite level drops below threshold.
 *
 * Nitrite is stored as mass (mg), so ppm is derived from mass/water.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import { HIGH_NITRITE_THRESHOLD } from '../livestock/tolerance.js';

export const highNitriteAlert: Alert = {
  id: 'high-nitrite',

  check(state: SimulationState): AlertResult {
    // Derive ppm from mass (mg) and water (L)
    const nitritePpm = getPpm(state.resources.nitrite, state.resources.water);
    const wasTriggered = state.alertState.highNitrite;

    // Check if currently above threshold
    const isAboveThreshold = nitritePpm > HIGH_NITRITE_THRESHOLD;

    if (isAboveThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        return {
          log: createLog(
            state.tick,
            'nitrogen-cycle',
            'warning',
            `High nitrite level: ${nitritePpm.toFixed(3)} ppm - toxic to fish`
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
