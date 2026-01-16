import type { SimulationState } from '../state.js';
import type { WaterChangeAmount } from './water-change.js';

export type ActionType = 'topOff' | 'feed' | 'scrubAlgae' | 'waterChange';

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

export interface WaterChangeAction extends BaseAction {
  type: 'waterChange';
  /** Fraction of water to change (0.1, 0.25, 0.5, 0.9) */
  amount: WaterChangeAmount;
}

export type Action = TopOffAction | FeedAction | ScrubAlgaeAction | WaterChangeAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
