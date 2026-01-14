import type { SimulationState } from '../state.js';
import type { Action, ActionResult } from './types.js';
import { topOff } from './top-off.js';
import { feed } from './feed.js';

export * from './types.js';
export * from './top-off.js';
export * from './feed.js';

/**
 * Apply a user action to the simulation state.
 * Actions are applied immediately (do not wait for tick).
 * Returns new state and result message.
 */
export function applyAction(
  state: SimulationState,
  action: Action
): ActionResult {
  // Note: When adding new action types:
  // 1. Add the type to ActionType in types.ts
  // 2. Add a case here - TypeScript will error if missing
  switch (action.type) {
    case 'topOff':
      return topOff(state);
    case 'feed':
      return feed(state, action);
  }
}
