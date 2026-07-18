import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedTheme } from '../../hooks/useTheme';
import type { RunSnapshot } from '../../run/index.js';
import {
  type ChartDef,
  type AlertMark,
  type TickRange,
  ALERT_LABEL,
  seriesColor,
  seriesValues,
  seriesExtent,
  normalize,
  snapshotAtTick,
  fractionToTick,
  tickToFraction,
} from '../../review/index.js';
import { Pill } from '../run/elements';

const HEIGHT = 156;
const PAD = { top: 12, right: 10, bottom: 16, left: 10 };

/** Track the plot's pixel width so lines, dots, and markers share one geometry. */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof globalThis.ResizeObserver === 'undefined') return;
    const observer = new globalThis.ResizeObserver((entries): void => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return (): void => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

interface ChartProps {
  def: ChartDef;
  history: RunSnapshot[];
  range: TickRange | null;
  currentTick: number;
  theme: ResolvedTheme;
  markers: AlertMark[];
  onScrubToTick: (tick: number) => void;
}

export function Chart({
  def,
  history,
  range,
  currentTick,
  theme,
  markers,
  onScrubToTick,
}: ChartProps): React.JSX.Element {
  const [ref, width] = useMeasuredWidth();
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const baselineY = PAD.top + plotH;

  const xForTick = useCallback(
    (tick: number): number => {
      if (!range) return PAD.left;
      return PAD.left + tickToFraction(tick, range.minTick, range.maxTick) * plotW;
    },
    [range, plotW]
  );
  const yForNorm = (n: number): number => PAD.top + (1 - n) * plotH;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (!range || plotW <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const fraction = (event.clientX - rect.left - PAD.left) / plotW;
      onScrubToTick(fractionToTick(fraction, range.minTick, range.maxTick));
    },
    [range, plotW, onScrubToTick]
  );

  const current = range ? snapshotAtTick(history, currentTick) : null;
  const guideX = xForTick(currentTick);
  const latestMarker = markers.length > 0 ? markers[markers.length - 1] : null;

  return (
    <section className="flex flex-col rounded-card border border-hairline bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <h3 className="text-[15px] font-semibold leading-none text-ink">{def.title}</h3>
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          {def.series.map((series) => (
            <span key={series.key} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: seriesColor(series, theme) }}
              />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      <div ref={ref} className="relative px-2" onClick={handleClick}>
        {history.length === 0 || !range ? (
          <div className="flex h-[156px] items-center justify-center text-[12.5px] text-ink-3">
            No data in this window yet.
          </div>
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            className="block cursor-pointer"
            role="img"
            aria-label={`${def.title} over ticks ${range.minTick}–${range.maxTick}`}
          >
            <line
              x1={PAD.left}
              y1={baselineY}
              x2={PAD.left + plotW}
              y2={baselineY}
              className="stroke-hairline"
              strokeWidth={1}
            />

            {def.series.map((series) => {
              const values = seriesValues(history, series.accessor);
              const extent = seriesExtent(values);
              const points = history
                .map((s, i) => `${xForTick(s.tick)},${yForNorm(normalize(values[i], extent))}`)
                .join(' ');
              return (
                <polyline
                  key={series.key}
                  points={points}
                  fill="none"
                  stroke={seriesColor(series, theme)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                />
              );
            })}

            {markers.map((mark, i) => (
              <line
                key={`${mark.tick}-${i}`}
                x1={xForTick(mark.tick)}
                y1={baselineY - 7}
                x2={xForTick(mark.tick)}
                y2={baselineY}
                className="stroke-alert"
                strokeWidth={1.5}
              >
                <title>
                  {ALERT_LABEL[mark.kind]} @{mark.tick}
                </title>
              </line>
            ))}

            <line
              x1={guideX}
              y1={PAD.top}
              x2={guideX}
              y2={baselineY}
              className="stroke-ink-3"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {current &&
              def.series.map((series) => {
                const extent = seriesExtent(seriesValues(history, series.accessor));
                return (
                  <circle
                    key={series.key}
                    cx={guideX}
                    cy={yForNorm(normalize(series.accessor(current), extent))}
                    r={2.5}
                    fill={seriesColor(series, theme)}
                  />
                );
              })}
          </svg>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2 font-mono text-[11px] text-ink-3 tabular-nums">
        <span>tick {range ? range.minTick : 0}</span>
        {latestMarker ? (
          <button
            type="button"
            onClick={() => onScrubToTick(latestMarker.tick)}
            className="rounded-badge focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Pill variant="alert">
              {ALERT_LABEL[latestMarker.kind]} @{latestMarker.tick}
            </Pill>
          </button>
        ) : (
          <span />
        )}
        <span>tick {range ? range.maxTick : 0}</span>
      </div>
    </section>
  );
}
