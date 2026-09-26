/**
 * High nitrate alert — fires once when nitrate crosses its edge, ahead of
 * every fish's own, and resets below it.
 *
 * Nitrate is stored as mass (mg), so ppm is derived from mass/water.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';
import { NITRATE_EDGE } from '../livestock/tolerance.js';

export const highNitrateAlert: Alert = {
  id: 'high-nitrate',

  check(state: SimulationState): AlertResult {
    // Derive ppm from mass (mg) and water (L)
    const nitratePpm = getPpm(state.resources.nitrate, state.resources.water);
    const wasTriggered = state.alertState.highNitrate;

    // Check if currently above threshold
    const isAboveThreshold = nitratePpm > NITRATE_EDGE;

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
