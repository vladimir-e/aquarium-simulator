/**
 * Analytics' view state lives in the query string, so a parked cursor is a link
 * someone can send and browser-back walks back out of it. Defaults are absent
 * rather than spelled out — `/analytics` is the whole run at the live edge, and
 * a running sim never rewrites the URL because following the edge has no param.
 *
 * `?tick=` is scoped to this section: `RunSnapshot` carries no AOB/NOB, waste,
 * nutrients or roster, so no other section can honour a historical cursor.
 */

import { type LogFilter, LOG_FILTERS } from './category.js';
import { type ReviewWindow, REVIEW_WINDOWS, type TickRange } from './window.js';

export const TICK_PARAM = 'tick';
export const WINDOW_PARAM = 'window';
export const LOG_PARAM = 'log';

const DEFAULT_WINDOW: ReviewWindow = 'run';
const DEFAULT_FILTER: LogFilter = 'all';

export interface AnalyticsView {
  window: ReviewWindow;
  filter: LogFilter;
  /** Parked tick, or null to follow the live edge. */
  tick: number | null;
}

/**
 * What a scrub means for the back button. `adjust` refines a cursor that is
 * already parked — a drag in flight, ±1, an arrow key — and replaces the entry
 * it started from, or back would replay every tick the drag passed through.
 * `commit` names a place: a log line, a typed tick, an end of the run, the live
 * edge. Leaving the live edge always pushes, whatever the intent, so back is
 * the way out of a parked cursor rather than the way out of the app.
 */
export type ScrubIntent = 'adjust' | 'commit';

export function readWindow(raw: string | null): ReviewWindow {
  return REVIEW_WINDOWS.find((w) => w === raw) ?? DEFAULT_WINDOW;
}

export function readFilter(raw: string | null): LogFilter {
  return LOG_FILTERS.find((f) => f === raw) ?? DEFAULT_FILTER;
}

/**
 * The cursor a `?tick=` names inside the window it lands in. Anything at or
 * past the live edge follows it instead of pinning to a tick that is about to
 * move; anything before the window clamps to its oldest snapshot, which is the
 * earliest state the charts can actually draw.
 */
export function readTick(raw: string | null, range: TickRange | null): number | null {
  if (raw === null || range === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const tick = Number(trimmed);
  if (!Number.isInteger(tick)) return null;
  if (tick >= range.maxTick) return null;
  return Math.max(tick, range.minTick);
}

/** The view as query params, with every default left out. */
export function viewParams(view: AnalyticsView): Record<string, string> {
  const params: Record<string, string> = {};
  if (view.tick !== null) params[TICK_PARAM] = String(view.tick);
  if (view.window !== DEFAULT_WINDOW) params[WINDOW_PARAM] = view.window;
  if (view.filter !== DEFAULT_FILTER) params[LOG_PARAM] = view.filter;
  return params;
}
