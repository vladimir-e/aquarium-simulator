/**
 * Low water alert — fires once when water drops below the level where it
 * starts to harm fish, resets above it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';

/** % of capacity the level alerts under: where the fish's water-level stressor starts. */
export function waterLevelAlertLine(config: TunableConfig): number {
  return config.livestock.waterLevelStressThreshold;
}

function floored(value: number): string {
  return (Math.floor(value * 10) / 10).toFixed(1);
}

export const waterLevelAlert: Alert = {
  id: 'water-level-critical',

  check(state: SimulationState, config: TunableConfig): AlertResult {
    const waterLevel = state.resources.water;
    const percent = (waterLevel / state.tank.capacity) * 100;
    const line = waterLevelAlertLine(config);

    if (!(waterLevel > 0 && percent < line)) {
      return { log: null, alertState: { waterLevelCritical: false } };
    }
    if (state.alertState.waterLevelCritical) {
      return { log: null, alertState: { waterLevelCritical: true } };
    }
    return {
      log: createLog(
        state.tick,
        'evaporation',
        'warning',
        `Water level low: ${floored(waterLevel)}L (${floored(percent)}% of capacity) - fish take harm under ${line}%`
      ),
      alertState: { waterLevelCritical: true },
    };
  },
};
