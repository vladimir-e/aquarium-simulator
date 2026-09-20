import React from 'react';
import {
  ALERT_LABEL,
  normalize,
  tickToFraction,
  dayGridTicks,
  type AlertMark,
  type TickRange,
  type TickSpan,
  type TrackDef,
  type TrackLine,
} from '../../review';
import type { RunSnapshot } from '../../run';

/** The band's own coordinate space; the SVG stretches it to whatever slot it gets. */
const VIEW_W = 1000;
const VIEW_H = 100;
/** Head- and footroom, so a peak or a trough is not clipped by the band edge. */
const PAD = 6;

/** A raw series value, at the precision its magnitude can carry. */
export function formatTrackValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return value.toFixed(decimals);
}

interface TrackProps {
  lines: TrackLine[];
  /** Tick of each sample, sharing its index with every line's values. */
  ticks: number[];
  range: TickRange | null;
  /** Lit hours behind the lines. */
  lit?: TickSpan[];
  /** The playhead, drawn across the band. */
  at?: number | null;
  label: string;
  className?: string;
}

/**
 * One band of the timeline: a few lines over a shared x-axis, each normalised
 * to its own extent. No fill under a line — a band is a shape to compare, not
 * an area to read — and the only colour in it is the series palette.
 */
export function Track({
  lines,
  ticks,
  range,
  lit = [],
  at = null,
  label,
  className = '',
}: TrackProps): React.JSX.Element {
  const x = (tick: number): number =>
    range ? tickToFraction(tick, range.minTick, range.maxTick) * VIEW_W : 0;
  const y = (norm: number): number => PAD + (1 - norm) * (VIEW_H - 2 * PAD);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`block h-full w-full ${className}`}
    >
      {lit.map((span) => (
        <rect
          key={`lit-${span.from}`}
          x={x(span.from)}
          y={0}
          width={Math.max(0, x(span.to) - x(span.from))}
          height={VIEW_H}
          className="fill-band"
          opacity={0.3}
        />
      ))}

      {lines.map((line) => (
        <polyline
          key={line.series.key}
          points={ticks
            .map((tick, i) => `${x(tick)},${y(normalize(line.values[i], line.extent))}`)
            .join(' ')}
          fill="none"
          stroke={line.color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {at !== null && (
        <line
          x1={x(at)}
          x2={x(at)}
          y1={0}
          y2={VIEW_H}
          className="stroke-accent"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

interface TrackCaptionProps {
  def: TrackDef;
  lines: TrackLine[];
  /** The snapshot the playhead is on, where the window holds one. */
  snapshot: RunSnapshot | null;
  /** Canonical °C → the reader's unit, so a caption matches the gauges. */
  displayTemp: (celsius: number) => number;
  /** State each line's extent too — the scale it was normalised against. */
  extents?: boolean;
  className?: string;
}

/**
 * What a track is showing: its name, then one chip per line carrying the value
 * at the playhead. Sans, tabular, ink — the colour is spent on the dot.
 */
export function TrackCaption({
  def,
  lines,
  snapshot,
  displayTemp,
  extents = false,
  className = '',
}: TrackCaptionProps): React.JSX.Element {
  const shown = (line: TrackLine, celsius: number): string =>
    formatTrackValue(line.series.key === 'temperature' ? displayTemp(celsius) : celsius);

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 ${className}`}>
      <span className="text-[11px] leading-[14px] text-ink-2">{def.title}</span>
      {lines.map((line) => (
        <span key={line.series.key} className="inline-flex items-baseline gap-1 text-[11px] leading-[14px]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: line.color }}
          />
          <span className="text-ink-3">{line.series.label}</span>
          {snapshot && (
            <span className="tabular-nums text-ink">
              {shown(line, line.series.accessor(snapshot))}
            </span>
          )}
          {extents && (
            <span className="tabular-nums text-ink-3">
              {shown(line, line.extent.min)}–{shown(line, line.extent.max)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

interface TimeAxisProps {
  range: TickRange | null;
  /** Ticks a keeper acted on. */
  actions: number[];
  alerts: AlertMark[];
  at: number;
  /** The playhead is parked rather than riding the live edge. */
  parked: boolean;
  className?: string;
}

/**
 * The shared x-axis under the tracks: midnights, what happened, and where the
 * playhead stands. Alerts are the only red on the timeline; an action is the
 * keeper's own mark, so it takes the accent.
 */
export function TimeAxis({
  range,
  actions,
  alerts,
  at,
  parked,
  className = '',
}: TimeAxisProps): React.JSX.Element {
  const left = (tick: number): string =>
    `${(range ? tickToFraction(tick, range.minTick, range.maxTick) : 0) * 100}%`;

  return (
    <div className={`relative h-3.5 ${className}`}>
      <span aria-hidden className="absolute inset-x-0 top-1.5 h-0.5 bg-hairline" />
      {dayGridTicks(range).map((day) => (
        <span
          key={`day-${day}`}
          aria-hidden
          className="absolute top-1 h-1.5 w-px bg-hairline"
          style={{ left: left(day) }}
        />
      ))}
      {actions.map((tick) => (
        <span
          key={`act-${tick}`}
          aria-hidden
          className="absolute top-0.5 h-2.5 w-0.5 bg-accent"
          style={{ left: left(tick) }}
        />
      ))}
      {alerts.map((mark) => (
        <span
          key={`alert-${mark.kind}-${mark.tick}`}
          aria-hidden
          title={`${ALERT_LABEL[mark.kind]} @${mark.tick}`}
          className="absolute top-0.5 h-2.5 w-0.5 bg-alert"
          style={{ left: left(mark.tick) }}
        />
      ))}
      <span
        aria-hidden
        className={`absolute top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ${parked ? 'bg-accent' : 'bg-ink'}`}
        style={{ left: left(at) }}
      />
    </div>
  );
}
