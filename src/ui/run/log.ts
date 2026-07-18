/**
 * Log selectors for the bottom strip: the single latest line it pins, and the
 * recent window (newest first) the expanded panel scrolls through.
 */

import type { LogEntry } from '../../simulation/index.js';

export function latestLog(logs: LogEntry[]): LogEntry | null {
  return logs.length > 0 ? logs[logs.length - 1] : null;
}

export function recentLogs(logs: LogEntry[], limit = 100): LogEntry[] {
  return logs.slice(-limit).reverse();
}
