/** Log selector for the chrome-row ticker: the single latest line it pins. */

import type { LogEntry } from '../../simulation/index.js';

export function latestLog(logs: LogEntry[]): LogEntry | null {
  return logs.length > 0 ? logs[logs.length - 1] : null;
}
