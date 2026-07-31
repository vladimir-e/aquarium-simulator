import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTheme } from '../../hooks/useTheme';
import type { RunSnapshot } from '../../run/index.js';
import {
  type ChartDef,
  type ChartSeries,
  type AlertMark,
  type TickRange,
  type Extent,
  ALERT_LABEL,
  seriesColor,
  seriesValues,
  seriesExtent,
  normalize,
  snapshotAtTick,
  fractionToTick,
  tickToFraction,
} from '../../review/index.js';

const PAD = { top: 12, right: 10, bottom: 16, left: 10 };

interface SeriesData {
  series: ChartSeries;
  values: number[];
  extent: Extent;
}

/** Compact readout for a raw series value (integers stay whole). */
function formatChartValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return value.toFixed(decimals);
}

/** Track the plot box so lines, dots, and markers share one geometry. */
function useMeasuredBox(): [React.RefObject<HTMLDivElement>, number, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBox({ width: el.clientWidth, height: el.clientHeight });
    if (typeof globalThis.ResizeObserver === 'undefined') return;
    const observer = new globalThis.ResizeObserver((entries): void => {
      const { width, height } = entries[0].contentRect;
      setBox({ width, height });
    });
    observer.observe(el);
    return (): void => {
      observer.disconnect();
    };
  }, []);
  return [ref, box.width, box.height];
}

interface ChartProps {
  def: ChartDef;
  history: RunSnapshot[];
  range: TickRange | null;
  currentTick: number;
  theme: ResolvedTheme;
  markers: AlertMark[];
  onScrubToTick: (tick: number) => void;
  /** Canonical °C → the viewer's unit, so the legend matches the gauges. */
  displayTemp: (celsius: number) => number;
}

/**
 * One frame, filling whatever slot the layout gives it. The legend doubles as
 * the cursor readout — each series states its value at the scrubbed tick, so
 * the numbers are legible on a touch screen, which has nothing to hover.
 */
export function Chart({
  def,
  history,
  range,
  currentTick,
  theme,
  markers,
  onScrubToTick,
  displayTemp,
}: ChartProps): React.JSX.Element {
  const [ref, width, height] = useMeasuredBox();
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);
  const baselineY = PAD.top + plotH;

  const displaySeriesValue = (series: ChartSeries, snapshot: RunSnapshot): number => {
    const raw = series.accessor(snapshot);
    return series.key === 'temperature' ? displayTemp(raw) : raw;
  };

  // One pass over history per series; rebuilt only when the window's data changes.
  const seriesData = useMemo<SeriesData[]>(
    () =>
      def.series.map((series) => {
        const values = seriesValues(history, series.accessor);
        return { series, values, extent: seriesExtent(values) };
      }),
    [def, history]
  );

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

  return (
    <section className="flex h-full min-h-0 flex-col rounded-card border border-hairline bg-surface">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-3 py-2">
        <h3 className="text-[13.5px] font-semibold leading-none text-ink">{def.title}</h3>
        <div className="ml-auto flex items-baseline gap-2.5 text-[11px] text-ink-3">
          {seriesData.map(({ series }) => (
            <span key={series.key} className="inline-flex items-baseline gap-1">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: seriesColor(series, theme) }}
              />
              <span>{series.label}</span>
              {current && (
                <span className="font-mono tabular-nums text-ink">
                  {formatChartValue(displaySeriesValue(series, current))}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div ref={ref} className="relative min-h-0 flex-1" onClick={handleClick}>
        {history.length === 0 || !range ? (
          <div className="flex h-full items-center justify-center text-[12.5px] text-ink-3">
            No data in this window yet.
          </div>
        ) : (
          <>
            <svg
              width={width}
              height={height}
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

              {seriesData.map(({ series, values, extent }) => {
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
                seriesData.map(({ series, extent }) => (
                  <circle
                    key={series.key}
                    cx={guideX}
                    cy={yForNorm(normalize(series.accessor(current), extent))}
                    r={2.5}
                    fill={seriesColor(series, theme)}
                  />
                ))}
            </svg>

            <span className="pointer-events-none absolute bottom-0.5 left-2.5 font-mono text-[10px] tabular-nums text-ink-3">
              T{range.minTick}
            </span>
            <span className="pointer-events-none absolute bottom-0.5 right-2.5 font-mono text-[10px] tabular-nums text-ink-3">
              T{range.maxTick}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
