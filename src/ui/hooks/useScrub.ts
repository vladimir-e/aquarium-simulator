import React, { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  clampTick,
  fractionToTick,
  nextScrubPosition,
  readTick,
  withParams,
  TICK_PARAM,
  type ScrubIntent,
  type TickRange,
} from '../review';
import { formatDayClock } from '../utils/clock.js';

export interface Scrub {
  /** Parked tick, or null while the cursor follows the live edge. */
  parked: number | null;
  /** The tick every surface draws at — the parked one, or the live edge. */
  at: number;
  park: (tick: number | null, intent: ScrubIntent) => void;
  /** Rewrite other view params, honouring the same back-button rule. */
  write: (patch: Record<string, string | null>, intent: ScrubIntent) => void;
  /** Props for a region that scrubs the whole range under the pointer. */
  surface: (label: string) => React.HTMLAttributes<HTMLDivElement> & {
    role: 'slider';
    tabIndex: number;
  };
}

/**
 * One playhead, owned by the address. Every surface that can move it — the
 * spine, the History tracks, a log line — writes the same `?tick=`, so they
 * are never on different ticks, and a drag replaces the entry it started from
 * rather than pushing one per tick it passed through. A route holds one of
 * these however many regions it spreads `surface` over: each measures itself,
 * and they all move the one cursor.
 */
export function useScrub(range: TickRange | null): Scrub {
  const [params, setParams] = useSearchParams();

  const parked = readTick(params.get(TICK_PARAM), range);
  const at = parked ?? range?.maxTick ?? 0;

  /**
   * Whether the cursor was parked as of the last write rather than the last
   * render: a drag issues several scrubs per frame, and reading that off
   * `parked` would let every one of them push its own back entry.
   */
  const parkedRef = useRef(parked !== null);
  useEffect(() => {
    parkedRef.current = parked !== null;
  }, [parked]);

  const write = useCallback(
    (patch: Record<string, string | null>, intent: ScrubIntent): void => {
      const next = withParams(params, patch);
      if (next.toString() === params.toString()) return;
      const replace = intent === 'resolve' || (intent === 'adjust' && parkedRef.current);
      if (TICK_PARAM in patch) parkedRef.current = patch[TICK_PARAM] !== null;
      setParams(next, { replace });
    },
    [params, setParams]
  );

  const park = useCallback(
    (tick: number | null, intent: ScrubIntent): void => {
      write({ [TICK_PARAM]: tick === null ? null : String(tick) }, intent);
    },
    [write]
  );

  /**
   * A `?tick=` the window cannot honour resolves to something else — its oldest
   * snapshot, or the live edge — and the address has to follow, or a deep link
   * leaves the URL naming a tick no surface is standing on.
   */
  const raw = params.get(TICK_PARAM);
  useEffect(() => {
    const resolved = parked === null ? null : String(parked);
    if (raw !== resolved) park(parked, 'resolve');
  }, [raw, parked, park]);

  const scrubTo = useCallback(
    (surface: HTMLElement, clientX: number): void => {
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || !range) return;
      const landed = fractionToTick(
        (clientX - rect.left) / rect.width,
        range.minTick,
        range.maxTick
      );
      park(nextScrubPosition(landed, range), 'adjust');
    },
    [park, range]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!range) return;
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const landing =
        e.key === 'Home' ? range.minTick : e.key === 'End' ? range.maxTick : null;
      if (step === 0 && landing === null) return;
      e.preventDefault();
      const tick = landing ?? clampTick(at + step, range.minTick, range.maxTick);
      park(nextScrubPosition(tick, range), landing === null ? 'adjust' : 'commit');
    },
    [range, at, park]
  );

  const dragging = useRef<number | null>(null);

  const surface = useCallback(
    (label: string) => ({
      role: 'slider' as const,
      tabIndex: 0,
      'aria-label': label,
      'aria-valuemin': range?.minTick ?? 0,
      'aria-valuemax': range?.maxTick ?? 0,
      'aria-valuenow': at,
      'aria-valuetext': formatDayClock(at),
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>): void => {
        dragging.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        scrubTo(e.currentTarget, e.clientX);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>): void => {
        if (dragging.current === e.pointerId) scrubTo(e.currentTarget, e.clientX);
      },
      onPointerUp: (): void => {
        dragging.current = null;
      },
      onPointerCancel: (): void => {
        dragging.current = null;
      },
      onKeyDown,
    }),
    [range, at, scrubTo, onKeyDown]
  );

  return { parked, at, park, write, surface };
}
