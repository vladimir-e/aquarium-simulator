/**
 * Alerts registry.
 * Central place to register all alerts that are checked after effects are applied.
 */

import type { Alert } from './types.js';
import type { LogEntry } from '../core/logging.js';
import type { AlertState, SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';
import { waterLevelAlert } from './water-level.js';
import { bloomAlerts } from './bloom.js';
import { highAmmoniaAlert } from './high-ammonia.js';
import { highNitriteAlert } from './high-nitrite.js';
import { highNitrateAlert } from './high-nitrate.js';
import { lowOxygenAlert } from './low-oxygen.js';
import { highCo2Alert } from './high-co2.js';

export type { Alert, AlertResult } from './types.js';
export type { BloomLevel } from './bloom.js';
export { waterLevelAlert, waterLevelAlertLine } from './water-level.js';
export { bloomAlert, bloomAlerts, bloomLevel, BLOOM_COVERAGE_LINE, PLANT_LIGHT_LINE } from './bloom.js';
export { highAmmoniaAlert, ammoniaAlertLine } from './high-ammonia.js';
export { highNitriteAlert } from './high-nitrite.js';
export { highNitrateAlert } from './high-nitrate.js';
export { lowOxygenAlert } from './low-oxygen.js';
export { highCo2Alert, HIGH_CO2_THRESHOLD } from './high-co2.js';

/** All alerts checked after effects are applied */
export const alerts: Alert[] = [
  waterLevelAlert,
  ...bloomAlerts,
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
export function checkAlerts(state: SimulationState, config: TunableConfig): CheckAlertsResult {
  const results = alerts.map((alert) => alert.check(state, config));

  // Collect all logs
  const logs = results.map((r) => r.log).filter((log): log is LogEntry => log !== null);

  // Merge all alertState updates
  const alertState: AlertState = {
    ...state.alertState,
    ...results.reduce((acc, r) => ({ ...acc, ...r.alertState }), {}),
  };

  return { logs, alertState };
}
