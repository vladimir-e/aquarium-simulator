import React, { useCallback, useRef } from 'react';
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
  surface: React.HTMLAttributes<HTMLDivElement> & {
    ref: React.RefObject<HTMLDivElement>;
    role: 'slider';
    tabIndex: number;
  };
}

/**
 * One playhead, owned by the address. Every surface that can move it — the
 * spine, the History tracks, a log line — writes the same `?tick=`, so they
 * are never on different ticks, and a drag replaces the entry it started from
 * rather than pushing one per tick it passed through.
 */
export function useScrub(range: TickRange | null, label: string): Scrub {
  const ref = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  const parked = readTick(params.get(TICK_PARAM), range);
  const at = parked ?? range?.maxTick ?? 0;

  /**
   * Whether the cursor was parked as of the last write rather than the last
   * render: a drag issues several scrubs per frame, and reading that off
   * `parked` would let every one of them push its own back entry.
   */
  const parkedRef = useRef(false);
  parkedRef.current = parked !== null;

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

  const scrubTo = useCallback(
    (clientX: number): void => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || !range) return;
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
      const step =
        e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const landing =
        e.key === 'Home' ? range.minTick : e.key === 'End' ? range.maxTick : null;
      if (step === 0 && landing === null) return;
      e.preventDefault();
      const tick = landing ?? clampTick(at + step, range.minTick, range.maxTick);
      park(nextScrubPosition(tick, range), landing === null ? 'adjust' : 'commit');
    },
    [range, at, park]
  );

  return {
    parked,
    at,
    park,
    write,
    surface: {
      ref,
      role: 'slider',
      tabIndex: 0,
      'aria-label': label,
      'aria-valuemin': range?.minTick ?? 0,
      'aria-valuemax': range?.maxTick ?? 0,
      'aria-valuenow': at,
      'aria-valuetext': formatDayClock(at),
      onPointerDown: (e): void => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubTo(e.clientX);
      },
      onPointerMove: (e): void => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e.clientX);
      },
      onKeyDown,
    },
  };
}
