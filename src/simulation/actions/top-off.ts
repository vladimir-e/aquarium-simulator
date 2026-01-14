import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult } from './types.js';

/**
 * Top Off: Restore water level to tank capacity.
 * Simulates adding fresh water to replace evaporated water.
 */
export function topOff(state: SimulationState): ActionResult {
  const { capacity } = state.tank;
  const waterLevel = state.resources.water;

  // Already at capacity, no action needed
  if (waterLevel >= capacity) {
    return {
      state,
      message: `Water already at capacity (${capacity}L)`,
    };
  }

  const amountAdded = capacity - waterLevel;

  const newState = produce(state, (draft) => {
    draft.resources.water = draft.tank.capacity;
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Topped off water: +${amountAdded.toFixed(1)}L to ${capacity}L`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${amountAdded.toFixed(1)}L`,
  };
}
