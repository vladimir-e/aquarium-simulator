import React from 'react';
import { INSET_FOCUS } from './focus';
import { RangeStrip, TONE_TEXT } from './RangeStrip';
import { CELL, ROW } from './row';
import type { StripBand, StripTone } from './strip.js';

const VALUE_SIZE = {
  md: 'text-[16px] leading-5',
  lg: 'text-[20px] leading-6',
};

export interface ReadingRowProps {
  name: string;
  value: string;
  unit?: string;
  /** Position on the strip, 0–1. Omitted, the row carries no strip. */
  at?: number;
  band?: StripBand | null;
  tone?: StripTone;
  /** Direction and rate, e.g. `↘ 0.2/d`. */
  trend?: string;
  /** Whatever the number alone doesn't say — truncates before the trend does. */
  note?: string;
  size?: keyof typeof VALUE_SIZE;
  /** Opens the reading's drawer. */
  onClick?: () => void;
}

/**
 * Every reading in the app, everywhere: name · value+unit · range strip ·
 * trend · note, on a 36 px rhythm. Only the marker, the number and the trend
 * take a tone — the row itself never tints.
 */
export function ReadingRow({
  name,
  value,
  unit,
  at,
  band = null,
  tone = 'ink',
  trend,
  note,
  size = 'md',
  onClick,
}: ReadingRowProps): React.JSX.Element {
  const body = (
    <>
      <span className={`${CELL} text-ink-2`}>{name}</span>
      <span className={`tabular-nums font-medium ${VALUE_SIZE[size]} ${TONE_TEXT[tone]}`}>
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-normal text-ink-2">{unit}</span>}
      </span>
      {at === undefined ? <span aria-hidden /> : <RangeStrip at={at} band={band} tone={tone} />}
      <span className="flex min-w-0 items-baseline justify-end gap-2 text-[12px]">
        {trend && (
          <span className={`shrink-0 tabular-nums ${tone === 'ink' ? 'text-ink-3' : TONE_TEXT[tone]}`}>
            {trend}
          </span>
        )}
        {note && <span className="truncate text-ink-3">{note}</span>}
      </span>
    </>
  );

  const shape = `${ROW} h-9 grid-cols-[minmax(40px,auto)_84px_minmax(48px,1fr)_minmax(96px,auto)] text-left`;

  if (!onClick) return <div className={shape}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shape} transition-colors hover:bg-surface-2 ${INSET_FOCUS}`}
    >
      {body}
    </button>
  );
}
