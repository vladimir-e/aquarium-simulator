/**
 * Alerts registry.
 * Central place to register all alerts that are checked after effects are applied.
 */

import type { Alert } from './types.js';
import type { LogEntry } from '../logging.js';
import type { SimulationState } from '../state.js';
import { waterLevelAlert } from './water-level.js';

export type { Alert } from './types.js';
export { waterLevelAlert, WATER_LEVEL_CRITICAL_THRESHOLD } from './water-level.js';

/** All alerts checked after effects are applied */
export const alerts: Alert[] = [
  waterLevelAlert,
  // Future alerts will be added here
];

/**
 * Check all alerts and return triggered log entries.
 */
export function checkAlerts(state: SimulationState): LogEntry[] {
  return alerts
    .map((alert) => alert.check(state))
    .filter((log): log is LogEntry => log !== null);
}
