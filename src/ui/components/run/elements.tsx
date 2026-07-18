import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Status } from '../../run/status';

const BAR_FILL: Record<Status, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alert: 'bg-alert',
  neutral: 'bg-ink-3',
};

const TEXT_COLOR: Record<Status, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alert: 'text-alert',
  neutral: 'text-ink-3',
};

/** Status text colour — for sparklines (via currentColor) and status words. */
export function statusText(status: Status): string {
  return TEXT_COLOR[status];
}

export const CONTROL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Shared control styling (no border-radius — callers add the corners they need). */
export function controlClasses(variant: 'primary' | 'secondary'): string {
  const v =
    variant === 'primary'
      ? 'bg-accent-tint text-accent hover:bg-accent-tint/70'
      : 'bg-surface text-ink-2 border border-hairline hover:text-ink hover:border-hairline-2';
  return `px-3 py-1.5 text-[13px] font-medium leading-none transition-[transform,colors] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none motion-reduce:transition-none ${v} ${CONTROL_FOCUS}`;
}

/** Plain flat button — the Scrub/Top-off workhorse. */
export function RunButton({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`flex items-center gap-1 rounded-control ${controlClasses(variant)} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Track-on-fill condition bar. Solid fill in the status colour, no hatch. */
export function Bar({
  value,
  status = 'ok',
  className = '',
}: {
  value: number;
  status?: Status;
  className?: string;
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-track ${className}`}>
      <div
        className={`h-full rounded-full ${BAR_FILL[status]} transition-[width] duration-200 motion-reduce:transition-none`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export type PillVariant = 'alert' | 'warn' | 'ok' | 'accent' | 'neutral';

const PILL: Record<PillVariant, string> = {
  alert: 'bg-alert-tint text-alert-text',
  warn: 'bg-warn-tint text-warn-text',
  ok: 'bg-ok-tint text-ok-text',
  accent: 'bg-accent-tint text-accent',
  neutral: 'border border-hairline text-ink-2',
};

export function Pill({
  variant = 'neutral',
  children,
  className = '',
}: {
  variant?: PillVariant;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-1.5 py-0.5 text-[11px] font-medium leading-none ${PILL[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Device power indicator: filled dot = on/healthy, hollow ring = off. */
export function StatusDot({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-ok' : 'border border-ink-3'}`}
    />
  );
}

/** Disclosure triangle that rotates on expand. */
export function Caret({ open }: { open: boolean }): React.JSX.Element {
  return (
    <ChevronRight
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
    />
  );
}

/** Most recent `count` samples, so the sparkline shows the near-term trend. */
function sparklinePoints(values: number[], width: number, height: number, count = 60): string | null {
  const sample = values.slice(-count);
  if (sample.length === 0) return null;
  const mid = height / 2;
  if (sample.length === 1) return `0,${mid} ${width},${mid}`;
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const span = max - min || 1;
  const pad = 3;
  return sample
    .map((v, i) => {
      const x = (i / (sample.length - 1)) * width;
      const y = height - pad - ((v - min) / span) * (height - 2 * pad);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Inline sparkline. Colour comes from the parent's text colour
 * (`currentColor`); the stroke stays 1.5px at any width via non-scaling-stroke.
 */
export function Sparkline({
  values,
  className = '',
}: {
  values: number[];
  className?: string;
}): React.JSX.Element {
  const width = 100;
  const height = 30;
  const points = sparklinePoints(values, width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-8 w-full ${className}`}
      aria-hidden
    >
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
