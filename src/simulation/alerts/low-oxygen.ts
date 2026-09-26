/**
 * Low oxygen alert — fires once when oxygen drops below `OXYGEN_EDGE`, resets
 * above it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { OXYGEN_EDGE } from '../livestock/tolerance.js';

export const lowOxygenAlert: Alert = {
  id: 'low-oxygen',

  check(state: SimulationState): AlertResult {
    const oxygenLevel = state.resources.oxygen;
    const wasTriggered = state.alertState.lowOxygen;

    // Check if currently below threshold
    const isBelowThreshold = oxygenLevel < OXYGEN_EDGE;

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
