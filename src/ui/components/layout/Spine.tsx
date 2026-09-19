import React, { useCallback, useRef } from 'react';
import { ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LogEntry } from '../../../simulation/index.js';
import {
  alertMarkers,
  categorizeLog,
  clampTick,
  dayGridTicks,
  fractionToTick,
  nextScrubPosition,
  readTick,
  tickToFraction,
  TICK_PARAM,
  type TickRange,
} from '../../review';
import type { RunSnapshot } from '../../run';
import { dayNumber } from '../../utils/clock';

interface SpineProps {
  history: RunSnapshot[];
  logs: LogEntry[];
  /** The live edge. */
  tick: number;
}

/**
 * Where the run is, along the whole run: day ticks, the alerts it hit, the
 * actions taken on it, and the playhead. The playhead is the review layer's
 * `?tick=`, so wherever the reader is standing the spine and the charts are
 * parked on the same tick, and back walks out of a scrub.
 */
export function Spine({ history, logs, tick }: SpineProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const range: TickRange = { minTick: history[0]?.tick ?? 0, maxTick: tick };
  const parked = readTick(params.get(TICK_PARAM), range);
  const at = tickToFraction(parked ?? range.maxTick, range.minTick, range.maxTick);

  /**
   * Whether the cursor was parked as of the last write rather than the last
   * render: a drag issues several scrubs per frame, and reading that off
   * `parked` would let every one of them push its own back entry.
   */
  const parkedRef = useRef(false);
  parkedRef.current = parked !== null;

  const park = useCallback(
    (next: number | null) => {
      const query = new globalThis.URLSearchParams(params);
      if (next === null) query.delete(TICK_PARAM);
      else query.set(TICK_PARAM, String(next));
      if (query.toString() === params.toString()) return;
      const replace = parkedRef.current;
      parkedRef.current = next !== null;
      setParams(query, { replace });
    },
    [params, setParams]
  );

  const scrubTo = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const landed = fractionToTick((clientX - rect.left) / rect.width, range.minTick, range.maxTick);
      park(nextScrubPosition(landed, range));
    },
    [park, range.minTick, range.maxTick]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e.clientX);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const from = parked ?? range.maxTick;
    park(nextScrubPosition(clampTick(from + step, range.minTick, range.maxTick), range));
  };

  const fraction = (t: number): string =>
    `${tickToFraction(t, range.minTick, range.maxTick) * 100}%`;

  const actionTicks = [
    ...new Set(logs.filter((log) => categorizeLog(log) === 'user').map((log) => log.tick)),
  ];

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-t border-hairline px-3 text-[11px] text-ink-3 max-md:h-6 max-md:gap-2">
      <span className="tabular-nums">Day {dayNumber(range.minTick)}</span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Run timeline"
        aria-valuemin={range.minTick}
        aria-valuemax={range.maxTick}
        aria-valuenow={parked ?? range.maxTick}
        aria-valuetext={`Day ${dayNumber(parked ?? range.maxTick)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className="relative h-3.5 flex-1 cursor-ew-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="absolute inset-x-0 top-1.5 h-0.5 bg-hairline" />
        {dayGridTicks(range).map((day) => (
          <span
            key={day}
            aria-hidden
            className="absolute top-1 h-1.5 w-px bg-hairline"
            style={{ left: fraction(day) }}
          />
        ))}
        {actionTicks.map((actionTick) => (
          <span
            key={`act-${actionTick}`}
            aria-hidden
            className="absolute top-0.5 h-2.5 w-0.5 bg-accent"
            style={{ left: fraction(actionTick) }}
          />
        ))}
        {alertMarkers(logs, range).map((mark) => (
          <span
            key={`alert-${mark.kind}-${mark.tick}`}
            aria-hidden
            className="absolute top-0.5 h-2.5 w-0.5 bg-alert"
            style={{ left: fraction(mark.tick) }}
          />
        ))}
        <span
          aria-hidden
          className={`absolute top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ${parked === null ? 'bg-ink' : 'bg-accent'}`}
          style={{ left: at * 100 + '%' }}
        />
      </div>

      <span className="tabular-nums">Day {dayNumber(range.maxTick)}</span>

      <Link
        to={{ pathname: '/history', search: params.toString() }}
        className="flex items-center gap-1 text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:hidden"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        charts
      </Link>
    </div>
  );
}
