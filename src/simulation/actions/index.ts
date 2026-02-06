import type { SimulationState } from '../state.js';
import type { Action, ActionResult } from './types.js';
import { topOff } from './top-off.js';
import { feed } from './feed.js';
import { scrubAlgae } from './scrub-algae.js';
import { waterChange } from './water-change.js';
import { trimPlants } from './trim-plants.js';
import { addPlant, removePlant } from './plant-management.js';
import { dose } from './dose.js';
import { addFish, removeFish } from './fish-management.js';

export * from './types.js';
export * from './top-off.js';
export * from './feed.js';
export * from './scrub-algae.js';
export * from './water-change.js';
export * from './trim-plants.js';
export * from './plant-management.js';
export * from './dose.js';
export * from './fish-management.js';

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
    case 'scrubAlgae':
      return scrubAlgae(state, action);
    case 'waterChange':
      return waterChange(state, action);
    case 'trimPlants':
      return trimPlants(state, action);
    case 'addPlant':
      return addPlant(state, action);
    case 'removePlant':
      return removePlant(state, action);
    case 'dose':
      return dose(state, action);
    case 'addFish':
      return addFish(state, action);
    case 'removeFish':
      return removeFish(state, action);
  }
}
