/**
 * Auto Top-Off (ATO) equipment - automatically restores water level.
 *
 * ATO monitors water level and tops off when level drops below 99% of capacity.
 * Restores water to exactly 100% in a single tick.
 *
 * When adding water:
 * - Temperature blends toward tap water temperature
 * - With mass-based nitrogen storage, ppm auto-decreases (no mass change needed)
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { blendTemperature } from '../core/blending.js';

/**
 * Water level threshold as fraction of capacity.
 * ATO triggers when water level falls below this threshold.
 */
export const WATER_LEVEL_THRESHOLD = 0.99;

/**
 * Process ATO: if water is below threshold, top off to 100% with temperature blending.
 */
export function atoUpdate(state: SimulationState): SimulationState {
  const { ato } = state.equipment;
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  if (!ato.enabled) {
    return state;
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel >= thresholdLevel) {
    return state;
  }

  const waterToAdd = capacity - waterLevel;

  return produce(state, (draft) => {
    // Blend temperature before adding water
    draft.resources.temperature = blendTemperature(
      draft.resources.temperature,
      waterLevel,
      draft.environment.tapWaterTemperature,
      waterToAdd
    );

    // Restore water to 100%
    draft.resources.water = capacity;

    // Log
    draft.logs.push(
      createLog(
        draft.tick,
        'equipment',
        'info',
        `ATO: added ${waterToAdd.toFixed(1)}L`
      )
    );
  });
}
