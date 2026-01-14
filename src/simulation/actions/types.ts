import type { SimulationState } from '../state.js';

export type ActionType = 'topOff' | 'feed' | 'scrubAlgae';

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

export interface ScrubAlgaeAction extends BaseAction {
  type: 'scrubAlgae';
  /** Optional: deterministic percentage for testing (0.1-0.3) */
  randomPercent?: number;
}

export type Action = TopOffAction | FeedAction | ScrubAlgaeAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
