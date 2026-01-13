/**
 * Feed action - adds food to the tank.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../logging.js';
import type { ActionResult, FeedAction } from './types.js';

/**
 * Feed: Add food to the tank.
 * Simulates adding fish food.
 */
export function feed(
  state: SimulationState,
  action: FeedAction
): ActionResult {
  const { amount } = action;

  // Validate amount
  if (amount <= 0) {
    return {
      state,
      message: 'Cannot feed 0 or negative amount',
    };
  }

  const newState = produce(state, (draft) => {
    // Add food to resources
    draft.resources.food = +(draft.resources.food + amount).toFixed(2);
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Fed ${amount.toFixed(1)}g of food`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${amount.toFixed(1)}g of food`,
  };
}
