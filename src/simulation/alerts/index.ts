/**
 * Alerts registry.
 * Central place to register all alerts that are checked after effects are applied.
 */

import type { Alert } from './types.js';
import type { LogEntry } from '../core/logging.js';
import type { AlertState, SimulationState } from '../state.js';
import { waterLevelAlert } from './water-level.js';
import { highAlgaeAlert } from './high-algae.js';
import { highAmmoniaAlert } from './high-ammonia.js';
import { highNitriteAlert } from './high-nitrite.js';
import { highNitrateAlert } from './high-nitrate.js';
import { lowOxygenAlert } from './low-oxygen.js';
import { highCo2Alert } from './high-co2.js';

export type { Alert, AlertResult } from './types.js';
export { waterLevelAlert, WATER_LEVEL_CRITICAL_THRESHOLD } from './water-level.js';
export { highAlgaeAlert, HIGH_ALGAE_THRESHOLD } from './high-algae.js';
export { highAmmoniaAlert, HIGH_AMMONIA_THRESHOLD } from './high-ammonia.js';
export { highNitriteAlert, HIGH_NITRITE_THRESHOLD } from './high-nitrite.js';
export { highNitrateAlert, HIGH_NITRATE_THRESHOLD } from './high-nitrate.js';
export { lowOxygenAlert, LOW_OXYGEN_THRESHOLD } from './low-oxygen.js';
export { highCo2Alert, HIGH_CO2_THRESHOLD } from './high-co2.js';

/** All alerts checked after effects are applied */
export const alerts: Alert[] = [
  waterLevelAlert,
  highAlgaeAlert,
  highAmmoniaAlert,
  highNitriteAlert,
  highNitrateAlert,
  lowOxygenAlert,
  highCo2Alert,
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
