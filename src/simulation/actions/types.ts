import type { SimulationState } from '../state.js';

export type ActionType = 'topOff';

export interface BaseAction {
  type: ActionType;
}

export interface TopOffAction extends BaseAction {
  type: 'topOff';
  // No parameters - always fills to capacity
}

export type Action = TopOffAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
