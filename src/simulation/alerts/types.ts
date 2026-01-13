/**
 * Alert system types.
 * Alerts check for warning conditions after effects are applied.
 */

import type { LogEntry } from '../logging.js';
import type { SimulationState } from '../state.js';

export interface Alert {
  /** Unique identifier for this alert */
  id: string;
  /** Check for alert condition and return log entry if triggered */
  check(state: SimulationState): LogEntry | null;
}
