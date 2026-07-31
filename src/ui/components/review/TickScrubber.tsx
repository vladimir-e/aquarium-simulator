import React, { useCallback, useRef, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import {
  type AlertMark,
  type ScrubIntent,
  type TickRange,
  ALERT_LABEL,
  clampTick,
  dayGridTicks,
  tickToFraction,
  fractionToTick,
} from '../../review/index.js';
import { TICKS_PER_DAY, formatDayClock } from '../../utils/clock.js';
import { controlClasses } from '../run/elements';
import { CONTROL_FOCUS } from '../ui/focus';

interface TickScrubberProps {
  range: TickRange | null;
  currentTick: number;
  /** The cursor is riding the live edge rather than parked on a tick. */
  following: boolean;
  markers: AlertMark[];
  onScrub: (tick: number, intent: ScrubIntent) => void;
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-hairline bg-surface font-mono text-[13px] text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink disabled:pointer-events-none disabled:opacity-50 ${CONTROL_FOCUS}`}
    >
      {label}
    </button>
  );
}

/**
 * The window's timeline. A drag resolves to the nearest tick the track's width
 * can name, which over a month-wide domain is nowhere near hour-exact — so the
 * step buttons and the tick field are the instrument, not the decoration; they
 * are how an exact tick gets into the URL. Dragging and stepping refine the
 * cursor; typing a tick, jumping to an end, or returning to the live edge
 * commit to a place worth a back step.
 */
export function TickScrubber({
  range,
  currentTick,
  following,
  markers,
  onScrub,
}: TickScrubberProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);

  const tickFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || !range) return currentTick;
      const rect = track.getBoundingClientRect();
      return fractionToTick((clientX - rect.left) / rect.width, range.minTick, range.maxTick);
    },
    [range, currentTick]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!range) return;
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      onScrub(tickFromClientX(event.clientX), 'adjust');
    },
    [range, tickFromClientX, onScrub]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!draggingRef.current) return;
      onScrub(tickFromClientX(event.clientX), 'adjust');
    },
    [tickFromClientX, onScrub]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!range) return;
      let next = currentTick;
      let intent: ScrubIntent = 'adjust';
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = currentTick - 1;
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = currentTick + 1;
          break;
        case 'PageDown':
          next = currentTick - TICKS_PER_DAY;
          break;
        case 'PageUp':
          next = currentTick + TICKS_PER_DAY;
          break;
        case 'Home':
          next = range.minTick;
          intent = 'commit';
          break;
        case 'End':
          next = range.maxTick;
          intent = 'commit';
          break;
        default:
          return;
      }
      event.preventDefault();
      onScrub(clampTick(next, range.minTick, range.maxTick), intent);
    },
    [range, currentTick, onScrub]
  );

  const commitDraft = useCallback((): void => {
    if (draft === null) return;
    const typed = Number(draft.trim());
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(typed) || !range) return;
    onScrub(clampTick(Math.round(typed), range.minTick, range.maxTick), 'commit');
  }, [draft, range, onScrub]);

  const step = (delta: number): void => {
    if (!range) return;
    onScrub(clampTick(currentTick + delta, range.minTick, range.maxTick), 'adjust');
  };

  const fraction = range ? tickToFraction(currentTick, range.minTick, range.maxTick) : 0;
  const percent = (tick: number): string =>
    `${(range ? tickToFraction(tick, range.minTick, range.maxTick) : 0) * 100}%`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline-2 bg-surface px-3 py-1.5">
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
        T{range ? range.minTick : 0}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={range ? 0 : -1}
        aria-label="Scrub run tick"
        aria-valuemin={range ? range.minTick : 0}
        aria-valuemax={range ? range.maxTick : 0}
        aria-valuenow={currentTick}
        aria-valuetext={`tick ${currentTick}, ${formatDayClock(currentTick)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        style={{ touchAction: 'none' }}
        className="relative flex h-11 min-w-[120px] flex-1 cursor-pointer items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-track" />
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-hairline-2"
          style={{ width: `${fraction * 100}%` }}
        />
        {dayGridTicks(range).map((tick) => (
          <div
            key={`day-${tick}`}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-1.5 w-px -translate-x-1/2 translate-y-1 bg-hairline-2"
            style={{ left: percent(tick) }}
          />
        ))}
        {markers.map((mark, i) => (
          <div
            key={`${mark.tick}-${i}`}
            title={`${ALERT_LABEL[mark.kind]} @${mark.tick}`}
            className="pointer-events-none absolute top-1/2 h-3.5 w-[1.5px] -translate-x-1/2 -translate-y-1/2 bg-alert"
            style={{ left: percent(mark.tick) }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-scrub shadow-sm"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
        T{range ? range.maxTick : 0}
      </span>

      <StepButton label="−1" onClick={() => step(-1)} disabled={!range} />
      <StepButton label="+1" onClick={() => step(1)} disabled={!range} />

      <label className="flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-hairline px-2">
        <span className="text-[11px] text-ink-3">tick</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Tick"
          disabled={!range}
          value={draft ?? String(currentTick)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setDraft(null);
          }}
          className="w-12 bg-transparent text-right font-mono text-[13px] font-medium tabular-nums text-ink outline-none"
        />
      </label>

      <span className="hidden shrink-0 font-mono text-[11.5px] tabular-nums text-ink-3 sm:inline">
        {formatDayClock(currentTick)}
      </span>

      <button
        type="button"
        disabled={!range || following}
        onClick={() => range && onScrub(range.maxTick, 'commit')}
        className={`ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-control ${controlClasses('secondary')}`}
      >
        Live edge
        <ChevronsRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
