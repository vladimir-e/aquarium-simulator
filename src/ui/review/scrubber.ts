/**
 * Scrubber geometry — the pure math that keeps the handle, the chart guides, and
 * the log highlight on one timeline. All of it degenerates cleanly to a single
 * tick (empty or one-entry history), where the domain has zero width.
 */

import type { LogEntry } from '../../simulation/index.js';
import { classifyAlert, type AlertMark } from './category.js';
import type { TickRange } from './window.js';

/**
 * Where a scrub request parks the handle: `null` (follow the live edge) when it
 * lands at or past the latest tick, otherwise the requested tick. Landing on the
 * end re-engages follow so a still-running sim keeps growing under the handle.
 */
export function nextScrubPosition(tick: number, range: TickRange | null): number | null {
  if (!range) return null;
  return tick >= range.maxTick ? null : tick;
}

export function clampTick(tick: number, minTick: number, maxTick: number): number {
  if (tick < minTick) return minTick;
  if (tick > maxTick) return maxTick;
  return tick;
}

/** Tick → 0..1 position along the track. A zero-width domain pins to the start. */
export function tickToFraction(tick: number, minTick: number, maxTick: number): number {
  if (maxTick <= minTick) return 0;
  return (clampTick(tick, minTick, maxTick) - minTick) / (maxTick - minTick);
}

/** 0..1 track position → nearest whole tick in the domain. */
export function fractionToTick(fraction: number, minTick: number, maxTick: number): number {
  if (maxTick <= minTick) return minTick;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(minTick + clamped * (maxTick - minTick));
}

/**
 * Index of the last log at or before `tick`, for the line the scrubber lands on.
 * Assumes `logs` is ascending by tick (as the engine emits them); −1 if none.
 */
export function nearestLogIndexAtOrBefore(logs: LogEntry[], tick: number): number {
  let index = -1;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].tick <= tick) index = i;
    else break;
  }
  return index;
}

/** Alert warnings inside the window, as markers for a chart baseline. */
export function alertMarkers(logs: LogEntry[], range: TickRange | null): AlertMark[] {
  const marks: AlertMark[] = [];
  for (const log of logs) {
    if (range && (log.tick < range.minTick || log.tick > range.maxTick)) continue;
    const kind = classifyAlert(log);
    if (kind) marks.push({ tick: log.tick, kind });
  }
  return marks;
}
