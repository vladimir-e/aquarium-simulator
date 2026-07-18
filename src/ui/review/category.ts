/**
 * Log categorisation for Review's filter chips and the alert language shared by
 * the summary tile and the chart markers. Both are derived from the engine's own
 * `source` / `severity` / `event` fields — Review never re-tags the log, it only
 * buckets what the simulation already emitted.
 */

import type { LogEntry } from '../../simulation/index.js';

/** Bucket a log line belongs to; `sim` is the catch-all for engine chatter. */
export type LogCategory = 'cycle' | 'user' | 'life' | 'sim';

/** Filter chips in the panel. `all` passes everything; `sim` has no chip. */
export type LogFilter = 'all' | 'cycle' | 'user' | 'life';

export const LOG_FILTERS: readonly LogFilter[] = ['all', 'cycle', 'user', 'life'];

/** Bracketed tag shown on each line (`[cycle]`, `[user]`, `[life]`, `[sim]`). */
export const CATEGORY_LABEL: Record<LogCategory, string> = {
  cycle: 'cycle',
  user: 'user',
  life: 'life',
  sim: 'sim',
};

const CHEMISTRY_SOURCES = new Set(['nitrogen-cycle', 'gas-exchange', 'algae', 'evaporation']);
const USER_SOURCES = new Set(['user', 'equipment', 'scrub']);

/**
 * A lifecycle discriminator wins over source: every `event` entry is a life
 * moment (birth, hatch, death, sale). Otherwise chemistry sources are the cycle,
 * user/equipment/scrub are player actions, and the rest is engine `sim` chatter.
 */
export function categorizeLog(log: LogEntry): LogCategory {
  if (log.event) return 'life';
  if (CHEMISTRY_SOURCES.has(log.source)) return 'cycle';
  if (USER_SOURCES.has(log.source)) return 'user';
  return 'sim';
}

export function filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
  if (filter === 'all') return logs;
  return logs.filter((log) => categorizeLog(log) === filter);
}

/** The chemistry / life thing an alert points at, for its short chip label. */
export type AlertKind =
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'co2'
  | 'oxygen'
  | 'algae'
  | 'water'
  | 'plant';

export const ALERT_LABEL: Record<AlertKind, string> = {
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
  co2: 'CO₂',
  oxygen: 'O₂',
  algae: 'algae',
  water: 'water',
  plant: 'plant',
};

/**
 * A warning that counts as an alert — the same predicate the run aggregates use:
 * a `fish-died` warning is a death, not an alert, so any warning carrying an
 * event is excluded and the rest (chemistry crossings, plant deaths) count.
 */
export function isAlertLog(log: LogEntry): boolean {
  return log.severity === 'warning' && log.event === undefined;
}

/** Which vital an alert warning is about, keyed on source then message. */
export function classifyAlert(log: LogEntry): AlertKind | null {
  if (!isAlertLog(log)) return null;
  const msg = log.message.toLowerCase();
  switch (log.source) {
    case 'nitrogen-cycle':
      if (msg.includes('ammonia')) return 'ammonia';
      if (msg.includes('nitrite')) return 'nitrite';
      if (msg.includes('nitrate')) return 'nitrate';
      return null;
    case 'gas-exchange':
      return msg.includes('oxygen') ? 'oxygen' : 'co2';
    case 'algae':
      return 'algae';
    case 'evaporation':
      return 'water';
    case 'simulation':
      return 'plant';
    default:
      return null;
  }
}

export interface AlertMark {
  tick: number;
  kind: AlertKind;
}

/** The most recent alert in the list, for the summary tile's type chip. */
export function latestAlert(logs: LogEntry[]): AlertMark | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const kind = classifyAlert(logs[i]);
    if (kind) return { tick: logs[i].tick, kind };
  }
  return null;
}
