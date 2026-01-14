import type { SimulationState } from '../state.js';

export type ActionType = 'topOff' | 'feed';

export interface BaseAction {
  type: ActionType;
}

export interface TopOffAction extends BaseAction {
  type: 'topOff';
  // No parameters - always fills to capacity
}

export interface FeedAction extends BaseAction {
  type: 'feed';
  /** Amount of food to add in grams */
  amount: number;
}

export type Action = TopOffAction | FeedAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
