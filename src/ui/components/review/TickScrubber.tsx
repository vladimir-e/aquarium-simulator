import React, { useCallback, useRef } from 'react';
import { type TickRange, clampTick, tickToFraction, fractionToTick } from '../../review/index.js';

const PAGE_STEP = 24; // one simulated day per PageUp/PageDown

interface TickScrubberProps {
  range: TickRange | null;
  currentTick: number;
  onScrubToTick: (tick: number) => void;
}

export function TickScrubber({ range, currentTick, onScrubToTick }: TickScrubberProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

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
      onScrubToTick(tickFromClientX(event.clientX));
    },
    [range, tickFromClientX, onScrubToTick]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!draggingRef.current) return;
      onScrubToTick(tickFromClientX(event.clientX));
    },
    [tickFromClientX, onScrubToTick]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!range) return;
      let next = currentTick;
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
          next = currentTick - PAGE_STEP;
          break;
        case 'PageUp':
          next = currentTick + PAGE_STEP;
          break;
        case 'Home':
          next = range.minTick;
          break;
        case 'End':
          next = range.maxTick;
          break;
        default:
          return;
      }
      event.preventDefault();
      onScrubToTick(clampTick(next, range.minTick, range.maxTick));
    },
    [range, currentTick, onScrubToTick]
  );

  const fraction = range ? tickToFraction(currentTick, range.minTick, range.maxTick) : 0;

  return (
    <div className="sticky bottom-0 z-10 border-t border-hairline-2 bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-3">
          tick {range ? range.minTick : 0}
        </span>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={range ? 0 : -1}
          aria-label="Scrub run tick"
          aria-valuemin={range ? range.minTick : 0}
          aria-valuemax={range ? range.maxTick : 0}
          aria-valuenow={currentTick}
          aria-valuetext={`tick ${currentTick}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          style={{ touchAction: 'none' }}
          className="relative flex h-6 flex-1 cursor-pointer items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-track" />
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-scrub shadow-sm"
            style={{ left: `${fraction * 100}%` }}
          />
        </div>

        <span className="w-14 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-ink">
          {currentTick}
        </span>
        <span className="hidden shrink-0 text-[12px] text-ink-3 lg:inline">
          drag to scrub — charts &amp; log follow
        </span>
      </div>
    </div>
  );
}
