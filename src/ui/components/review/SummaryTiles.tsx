import React from 'react';
import type { LogEntry } from '../../../simulation/index.js';
import type { RunAggregates } from '../../run/index.js';
import { useUnits } from '../../hooks/useUnits';
import { ALERT_LABEL, latestAlert } from '../../review/index.js';
import { Pill } from '../run/elements';

/** Ticks are simulated hours: render a compact d/h reading. */
function formatDuration(ticks: number): string {
  const days = Math.floor(ticks / 24);
  const hours = ticks % 24;
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}

function Tile({
  label,
  value,
  unit,
  meta,
  chip,
}: {
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  chip?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-[104px] flex-1 rounded-card border border-hairline bg-surface px-3.5 py-2.5">
      <div className="text-[12px] tracking-[0.03em] text-ink-3">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[20px] font-medium leading-none tabular-nums text-ink">{value}</span>
        {unit && <span className="text-[11px] tracking-[0.04em] text-ink-3">{unit}</span>}
        {chip}
      </div>
      {meta && <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-3">{meta}</div>}
    </div>
  );
}

interface SummaryItem {
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  /** Trailing word for the compact mobile pill (`36 ticks`, `0 deaths`). */
  descriptor: string;
  chip?: React.ReactNode;
}

export function SummaryTiles({
  aggregates,
  logs,
}: {
  aggregates: RunAggregates;
  logs: LogEntry[];
}): React.JSX.Element {
  const { formatVol } = useUnits();
  const latest = latestAlert(logs);

  const items: SummaryItem[] = [
    {
      label: 'run length',
      value: String(aggregates.ticks),
      unit: 'ticks',
      meta: formatDuration(aggregates.ticks),
      descriptor: 'ticks',
    },
    { label: 'deaths', value: String(aggregates.deaths), descriptor: 'deaths' },
    { label: 'births', value: String(aggregates.births), unit: 'fry', descriptor: 'fry' },
    {
      label: 'alerts',
      value: String(aggregates.alerts),
      descriptor: aggregates.alerts === 1 ? 'alert' : 'alerts',
      chip: latest && <Pill variant="alert">{ALERT_LABEL[latest.kind]}</Pill>,
    },
    { label: 'water changed', value: formatVol(aggregates.waterChangedL, 0), descriptor: 'changed' },
  ];

  return (
    <>
      <div className="hidden flex-wrap gap-3 sm:flex">
        {items.map((item) => (
          <Tile
            key={item.label}
            label={item.label}
            value={item.value}
            unit={item.unit}
            meta={item.meta}
            chip={item.chip}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 sm:hidden">
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-badge border border-hairline bg-surface px-2.5 py-1 text-[12px] text-ink-2"
          >
            <span className="font-mono tabular-nums text-ink">{item.value}</span>
            {item.descriptor}
            {item.chip}
          </span>
        ))}
      </div>
    </>
  );
}
