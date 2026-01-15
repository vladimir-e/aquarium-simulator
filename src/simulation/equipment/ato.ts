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
  /** Effects to apply (water addition) */
  effects: Effect[];
  /** Amount of water to add (for temperature blending calculation) */
  waterToAdd: number;
}

/**
 * Updates ATO state and generates water addition effects.
 */
export function atoUpdate(state: SimulationState): AtoResult {
  const { ato } = state.equipment;
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  if (!ato.enabled) {
    return { effects: [], waterToAdd: 0 };
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel < thresholdLevel) {
    const waterNeeded = capacity - waterLevel;

    return {
      effects: [
        {
          tier: 'immediate',
          resource: 'water',
          delta: waterNeeded,
          source: 'ato',
        },
      ],
      waterToAdd: waterNeeded,
    };
  }

  return { effects: [], waterToAdd: 0 };
}

/**
 * Apply temperature blending when ATO adds water.
 */
export function applyAtoTemperatureBlending(
  state: SimulationState,
  waterToAdd: number
): SimulationState {
  if (waterToAdd <= 0) {
    return state;
  }

  const currentWater = state.resources.water;

  return produce(state, (draft) => {
    const oldTemp = draft.resources.temperature;
    const tapTemp = draft.environment.tapWaterTemperature;

    draft.resources.temperature = blendTemperature(
      oldTemp,
      currentWater,
      tapTemp,
      waterToAdd
    );

    // Log the ATO action
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
