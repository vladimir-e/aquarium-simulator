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
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { blendTemperature } from '../core/blending.js';

/**
 * Water level threshold as fraction of capacity.
 * ATO triggers when water level falls below this threshold.
 */
export const WATER_LEVEL_THRESHOLD = 0.99;

export interface AtoResult {
  /** Updated state (with temperature blending and logging applied) */
  state: SimulationState;
  /** Effects to apply (water addition) */
  effects: Effect[];
}

/**
 * Updates ATO state: checks water level, blends temperature, and generates water addition effects.
 */
export function atoUpdate(state: SimulationState): AtoResult {
  const { ato } = state.equipment;
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  if (!ato.enabled) {
    return { state, effects: [] };
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel < thresholdLevel) {
    const waterToAdd = capacity - waterLevel;

    // Apply temperature blending and logging
    const newState = produce(state, (draft) => {
      draft.resources.temperature = blendTemperature(
        draft.resources.temperature,
        waterLevel,
        draft.environment.tapWaterTemperature,
        waterToAdd
      );

      draft.logs.push(
        createLog(
          draft.tick,
          'equipment',
          'info',
          `ATO: added ${waterToAdd.toFixed(1)}L`
        )
      );
    });

    return {
      state: newState,
      effects: [
        {
          tier: 'immediate',
          resource: 'water',
          delta: waterToAdd,
          source: 'ato',
        },
      ],
    };
  }

  return { state, effects: [] };
}
