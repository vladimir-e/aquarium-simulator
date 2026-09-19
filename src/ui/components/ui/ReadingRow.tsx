import React from 'react';
import { RangeStrip, type StripBand, type StripTone } from './RangeStrip';

const VALUE_TONE: Record<StripTone, string> = {
  ink: 'text-ink',
  warn: 'text-warn',
  alert: 'text-alert',
};

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
      <span className="truncate text-ink-2">{name}</span>
      <span className={`tabular-nums font-medium ${VALUE_SIZE[size]} ${VALUE_TONE[tone]}`}>
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-normal text-ink-2">{unit}</span>}
      </span>
      {at === undefined ? <span /> : <RangeStrip at={at} band={band} tone={tone} />}
      <span className="flex min-w-0 items-baseline justify-end gap-2 text-[12px]">
        {trend && (
          <span className={`shrink-0 tabular-nums ${tone === 'ink' ? 'text-ink-3' : VALUE_TONE[tone]}`}>
            {trend}
          </span>
        )}
        {note && <span className="truncate text-ink-3">{note}</span>}
      </span>
    </>
  );

  const shape =
    'grid h-9 w-full grid-cols-[minmax(40px,auto)_84px_minmax(48px,1fr)_minmax(0,auto)] items-center gap-2.5 border-t border-hairline text-left first:border-t-0';

  if (!onClick) return <div className={shape}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shape} transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
    >
      {body}
    </button>
  );
}
