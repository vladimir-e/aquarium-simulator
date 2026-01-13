/**
 * Water level critical alert.
 * Triggers when water level drops below 20% of tank capacity.
 */

import type { Alert } from './types.js';
import type { LogEntry } from '../logging.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../logging.js';

/** Threshold for critical water level (20% of capacity) */
export const WATER_LEVEL_CRITICAL_THRESHOLD = 0.2;

export const waterLevelAlert: Alert = {
  id: 'water-level-critical',

  check(state: SimulationState): LogEntry | null {
    const { waterLevel, capacity } = state.tank;

    // Don't alert if tank is completely empty (different condition)
    // Alert when water level drops below 20% capacity
    if (waterLevel > 0 && waterLevel / capacity < WATER_LEVEL_CRITICAL_THRESHOLD) {
      const percent = ((waterLevel / capacity) * 100).toFixed(1);
      return createLog(
        state.tick,
        'evaporation',
        'warning',
        `Water level critical: ${waterLevel.toFixed(1)}L (${percent}% of capacity)`
      );
    }

    return null;
  },
};
