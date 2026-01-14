/**
 * Alert system types.
 * Alerts check for warning conditions after effects are applied.
 */

import type { LogEntry } from '../core/logging.js';
import type { AlertState, SimulationState } from '../state.js';

/**
 * Result of an alert check.
 * Contains the log entry (if alert should fire) and updated alert state.
 */
export interface AlertResult {
  /** Log entry to add (null if alert shouldn't fire this tick) */
  log: LogEntry | null;
  /** Updated alert state flags */
  alertState: Partial<AlertState>;
}

export interface Alert {
  /** Unique identifier for this alert */
  id: string;
  /** Check for alert condition and return result with log and state update */
  check(state: SimulationState): AlertResult;
}
