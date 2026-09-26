/**
 * Feed action - adds food to the tank.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { FoodResource } from '../resources/index.js';
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

  if (!Number.isFinite(amount)) {
    return {
      state,
      message: 'Feed amount must be a number',
    };
  }

  if (amount <= 0) {
    return {
      state,
      message: 'Cannot feed 0 or negative amount',
    };
  }

  const grams = amount.toFixed(FoodResource.precision);
  const newState = produce(state, (draft) => {
    draft.resources.food += amount;
    draft.logs.push(createLog(draft.tick, 'user', 'info', `Fed ${grams}g of food`));
  });

  return {
    state: newState,
    message: `Added ${grams}g of food`,
  };
}
