/**
 * The time view lives in the query string. A default is absent rather than
 * spelled out, so a running sim never rewrites the URL — following has no
 * param. Nothing but the spine and the tracks honours `?tick=`: `RunSnapshot`
 * carries no AOB/NOB, waste, nutrients or roster for another module to draw at
 * a historical cursor.
 */

import { type LogFilter, LOG_FILTERS } from './category.js';
import { type ReviewWindow, REVIEW_WINDOWS, type TickRange } from './window.js';

export const TICK_PARAM = 'tick';
export const WINDOW_PARAM = 'window';
export const LOG_PARAM = 'log';

export const DEFAULT_WINDOW: ReviewWindow = 'run';
export const DEFAULT_FILTER: LogFilter = 'all';

/**
 * What a scrub means for the back button. `adjust` refines a cursor that is
 * already parked — a drag in flight, ±1, an arrow key — and replaces the entry
 * it started from, or back would replay every tick the drag passed through.
 * `commit` names a place: a log line, a window change, an end of the run, the
 * live edge. Leaving the live edge always pushes, whatever the intent, so back
 * is the way out of a parked cursor rather than the way out of the app.
 * `resolve` is not a move at all — it is the address catching up with a tick
 * the window could not honour, and it never earns a back step.
 */
export type ScrubIntent = 'adjust' | 'commit' | 'resolve';

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
 * earliest state the tracks can actually draw.
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

/**
 * The address with some params rewritten. A `null` value drops its param, which
 * is how a default leaves the URL — a view at its defaults has no query at all.
 */
export function withParams(
  params: globalThis.URLSearchParams,
  patch: Record<string, string | null>
): globalThis.URLSearchParams {
  const next = new globalThis.URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next;
}
