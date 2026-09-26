/**
 * Low water alert — fires once when water drops below the level where it
 * starts to harm fish, resets at or above it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { floored, latch } from './latch.js';

/** % of capacity the level alerts under: where the fish's water-level stressor starts. */
export function waterLevelAlertLine(config: TunableConfig): number {
  return config.livestock.waterLevelStressThreshold;
}

export const waterLevelAlert: Alert = {
  id: 'water-level-critical',

  check(state: SimulationState, config: TunableConfig): AlertResult {
    const water = state.resources.water;
    const percent = (water / state.tank.capacity) * 100;
    const line = waterLevelAlertLine(config);
    return latch(
      state,
      'waterLevelCritical',
      water > 0 && percent < line,
      'evaporation',
      `Water level low: ${floored(water, 1)}L (${floored(percent, 1)}% of capacity) - fish take harm under ${line}%`
    );
  },
};
