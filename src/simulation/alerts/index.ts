/**
 * Alerts registry.
 * Central place to register all alerts that are checked after effects are applied.
 */

import type { Alert } from './types.js';
import type { LogEntry } from '../core/logging.js';
import type { AlertState, SimulationState } from '../state.js';
import { waterLevelAlert } from './water-level.js';

export type { Alert, AlertResult } from './types.js';
export { waterLevelAlert, WATER_LEVEL_CRITICAL_THRESHOLD } from './water-level.js';

/** All alerts checked after effects are applied */
export const alerts: Alert[] = [
  waterLevelAlert,
  // Future alerts will be added here
];

/**
 * Result of checking all alerts.
 */
export interface CheckAlertsResult {
  /** Log entries to add */
  logs: LogEntry[];
  /** Updated alert state */
  alertState: AlertState;
}

/**
 * Check all alerts and return logs and updated alert state.
 */
export function checkAlerts(state: SimulationState): CheckAlertsResult {
  const results = alerts.map((alert) => alert.check(state));

  // Collect all logs
  const logs = results.map((r) => r.log).filter((log): log is LogEntry => log !== null);

  // Merge all alertState updates
  const alertState: AlertState = {
    ...state.alertState,
    ...results.reduce((acc, r) => ({ ...acc, ...r.alertState }), {}),
  };

  return { logs, alertState };
}
