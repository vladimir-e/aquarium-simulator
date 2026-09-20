import React from 'react';
import type { StripBand, StripTone } from './strip.js';

const MARKER: Record<StripTone, string> = {
  ink: 'bg-ink',
  warn: 'bg-warn',
  alert: 'bg-alert',
};

/** The one place a tone becomes text colour — numbers, words and trends alike. */
export const TONE_TEXT: Record<StripTone, string> = {
  ink: 'text-ink',
  warn: 'text-warn',
  alert: 'text-alert',
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface RangeStripProps {
  /** The value's position along the track, 0–1. */
  at: number;
  /** Where the value stands now, when the live marker is where it would go. */
  ghost?: number | null;
  /** The reference band; null leaves the track unlit and the reading quiet. */
  band?: StripBand | null;
  tone?: StripTone;
  className?: string;
}

/**
 * The one encoding rule: a 4 px track, the reference band lit on it, the value
 * a 2 px marker. Fullness never means anything — there is no fill to read.
 * Decorative by construction: the number it belongs to is the accessible value.
 */
export function RangeStrip({
  at,
  ghost = null,
  band = null,
  tone = 'ink',
  className = '',
}: RangeStripProps): React.JSX.Element {
  const from = band ? clamp(Math.min(band.from, band.to)) : 0;
  const to = band ? clamp(Math.max(band.from, band.to)) : 0;

  return (
    <span aria-hidden className={`relative block h-1 bg-surface-2 ${className}`}>
      {band && (
        <span
          data-band
          className="absolute inset-y-0 bg-band"
          style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
        />
      )}
      {ghost !== null && (
        <span
          data-ghost
          className="absolute -top-[3px] h-2.5 w-0.5 bg-ink-3 opacity-60"
          style={{ left: `calc(${clamp(ghost) * 100}% - 1px)` }}
        />
      )}
      <span
        className={`absolute -top-[3px] h-2.5 w-0.5 ${MARKER[tone]}`}
        style={{ left: `calc(${clamp(at) * 100}% - 1px)` }}
      />
    </span>
  );
}
