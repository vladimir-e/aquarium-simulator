import React, { useCallback, useRef } from 'react';
import { ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LogEntry } from '../../../simulation/index.js';
import {
  alertMarkers,
  categorizeLog,
  clampTick,
  dayGridTicks,
  fractionToTick,
  nextScrubPosition,
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
  /** Where the handle is parked, or null when it follows the live edge. */
  parked: number | null;
  onScrub: (tick: number | null) => void;
}

/**
 * Where the run is, along the whole run: day ticks, the alerts it hit, the
 * actions taken on it, and the playhead. Dragging parks the handle; the handle
 * itself opens History at whatever tick it is parked on.
 */
export function Spine({ history, logs, tick, parked, onScrub }: SpineProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const range: TickRange = { minTick: history[0]?.tick ?? 0, maxTick: tick };
  const at = tickToFraction(parked ?? range.maxTick, range.minTick, range.maxTick);

  const scrubTo = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const landed = fractionToTick((clientX - rect.left) / rect.width, range.minTick, range.maxTick);
      onScrub(nextScrubPosition(landed, range));
    },
    [onScrub, range.minTick, range.maxTick]
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
    onScrub(nextScrubPosition(clampTick(from + step, range.minTick, range.maxTick), range));
  };

  const fraction = (t: number): string =>
    `${tickToFraction(t, range.minTick, range.maxTick) * 100}%`;

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
        {logs.filter((log) => categorizeLog(log) === 'user').map((log, i) => (
          <span
            key={`act-${i}`}
            aria-hidden
            className="absolute top-0.5 h-2.5 w-0.5 bg-accent"
            style={{ left: fraction(log.tick) }}
          />
        ))}
        {alertMarkers(logs, range).map((mark, i) => (
          <span
            key={`alert-${i}`}
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
        to={parked === null ? '/history' : `/history?${TICK_PARAM}=${parked}`}
        className="flex items-center gap-1 text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:hidden"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        charts
      </Link>
    </div>
  );
}
