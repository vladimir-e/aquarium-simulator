/**
 * Water level critical alert.
 * Triggers once when water level drops below 20% of tank capacity.
 * Resets when water level goes back above threshold.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';

/** Threshold for critical water level (20% of capacity) */
export const WATER_LEVEL_CRITICAL_THRESHOLD = 0.2;

export const waterLevelAlert: Alert = {
  id: 'water-level-critical',

  check(state: SimulationState): AlertResult {
    const { capacity } = state.tank;
    const waterLevel = state.resources.water;
    const wasTriggered = state.alertState.waterLevelCritical;

    // Check if currently below threshold (and tank not empty)
    const isBelowThreshold =
      waterLevel > 0 && waterLevel / capacity < WATER_LEVEL_CRITICAL_THRESHOLD;

    if (isBelowThreshold) {
      // Condition is active
      if (!wasTriggered) {
        // Just crossed threshold - fire alert and set flag
        const percent = ((waterLevel / capacity) * 100).toFixed(1);
        return {
          log: createLog(
            state.tick,
            'evaporation',
            'warning',
            `Water level critical: ${waterLevel.toFixed(1)}L (${percent}% of capacity)`
          ),
          alertState: { waterLevelCritical: true },
        };
      }
      // Already triggered, don't fire again but keep flag set
      return { log: null, alertState: { waterLevelCritical: true } };
    }

    // Condition is not active - clear the flag so it can fire again
    return { log: null, alertState: { waterLevelCritical: false } };
  },
};
