/**
 * Window scoping for Review. One tick range drives the charts, the scrubber
 * domain, and the log view together, so "24h" means the same last-24-ticks span
 * everywhere. `run` is the whole history buffer (capped at 30 days upstream).
 */

import type { LogEntry } from '../../simulation/index.js';
import type { RunSnapshot } from '../run/index.js';

export type ReviewWindow = 'run' | '24h' | '7d';

export const REVIEW_WINDOWS: readonly ReviewWindow[] = ['run', '24h', '7d'];

/** Trailing tick span for the bounded windows (hourly ticks). */
export const WINDOW_TICKS: Record<Exclude<ReviewWindow, 'run'>, number> = {
  '24h': 24,
  '7d': 168,
};

export interface TickRange {
  minTick: number;
  maxTick: number;
}

/** Snapshots kept for the window: the whole buffer, or its trailing N ticks. */
export function sliceHistory(history: RunSnapshot[], window: ReviewWindow): RunSnapshot[] {
  if (window === 'run') return history;
  return history.slice(-WINDOW_TICKS[window]);
}

/** The [minTick, maxTick] the window spans, or null when there's no history. */
export function windowRange(history: RunSnapshot[], window: ReviewWindow): TickRange | null {
  if (history.length === 0) return null;
  const slice = sliceHistory(history, window);
  return { minTick: slice[0].tick, maxTick: slice[slice.length - 1].tick };
}

/** Log lines whose tick falls in the window; unscoped when there's no range. */
export function sliceLogs(logs: LogEntry[], range: TickRange | null): LogEntry[] {
  if (!range) return logs;
  return logs.filter((log) => log.tick >= range.minTick && log.tick <= range.maxTick);
}
