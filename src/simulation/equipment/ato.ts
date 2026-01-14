/**
 * Auto Top-Off (ATO) equipment - automatically restores water level.
 *
 * ATO monitors water level and tops off when level drops below 99% of capacity.
 * Restores water to exactly 100% in a single tick.
 *
 * Note: ATO adds pure water (no dilution effects yet). Dilution system
 * will handle chemistry changes in a future task.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';

/**
 * Water level threshold as fraction of capacity.
 * ATO triggers when water level falls below this threshold.
 */
export const WATER_LEVEL_THRESHOLD = 0.99;

/**
 * Updates ATO state and generates water addition effects.
 */
export function atoUpdate(state: SimulationState): Effect[] {
  const { ato } = state.equipment;
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  if (!ato.enabled) {
    return [];
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel < thresholdLevel) {
    const waterNeeded = capacity - waterLevel;

    return [
      {
        tier: 'immediate',
        resource: 'water',
        delta: waterNeeded,
        source: 'ato',
      },
    ];
  }

  return [];
}
