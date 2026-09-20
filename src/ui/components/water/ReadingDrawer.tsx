import React from 'react';
import type { ReadingBook, ReadingFlow, ReadingId } from '../../readings';
import { normalize, seriesExtent } from '../../review/charts.js';
import type { RunSnapshot } from '../../run';
import { Drawer } from '../ui/Drawer';
import { RangeStrip } from '../ui/RangeStrip';

const HERO_TONE = {
  ink: 'text-ink',
  warn: 'text-warn',
  alert: 'text-alert',
};

/** A week of hourly samples — as far back as the reading rows' trend can reach. */
const WINDOW_HOURS = 24 * 7;

function Chart({
  history,
  read,
}: {
  history: RunSnapshot[];
  read: (snapshot: RunSnapshot) => number;
}): React.JSX.Element {
  const window = history.slice(-WINDOW_HOURS);
  const values = window.map(read);
  const extent = seriesExtent(values);
  const points = values
    .map(
      (value, i) =>
        `${1 + (i / Math.max(1, values.length - 1)) * 98},${(1 - normalize(value, extent)) * 36 + 2}`
    )
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden
        className="h-10 w-full"
      >
        <polyline points={points} fill="none" stroke="var(--chart-1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>{window.length >= WINDOW_HOURS ? '7 days' : `${Math.max(1, Math.round(window.length / 24))} d so far`}</span>
        <span className="tabular-nums">
          {extent.min.toFixed(2)} – {extent.max.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function Flows({ title, flows }: { title: string; flows: ReadingFlow[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[11px] text-ink-3">{title}</h3>
      {flows.map((flow) => (
        <div key={flow.label} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="truncate text-ink-2">{flow.label}</span>
          <span className="shrink-0 tabular-nums text-ink">{flow.rate}</span>
        </div>
      ))}
    </div>
  );
}

interface ReadingDrawerProps {
  /** Which reading is open; null closes the drawer. */
  id: ReadingId | null;
  book: ReadingBook;
  history: RunSnapshot[];
  onClose: () => void;
}

/**
 * One reading, inspected: the number at hero size, the band it is judged
 * against stated in words, the week behind it, and what fills and drains the
 * stock. Keyed by id rather than handed a body, so every surface that shows a
 * reading opens the same inspector for it.
 */
export function ReadingDrawer({
  id,
  book,
  history,
  onClose,
}: ReadingDrawerProps): React.JSX.Element | null {
  if (id === null) return null;
  const reading = book.byId[id];

  return (
    <Drawer open onClose={onClose} title={reading.name}>
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[28px] leading-8 font-medium tabular-nums ${HERO_TONE[reading.tone]}`}>
              {reading.value}
            </span>
            {reading.unit && <span className="text-[13px] text-ink-2">{reading.unit}</span>}
            {reading.trend && (
              <span className="ml-auto text-[13px] tabular-nums text-ink-2">{reading.trend}</span>
            )}
          </div>
          <RangeStrip at={reading.at} band={reading.band} tone={reading.tone} />
          <p className="text-[13px] leading-[18px] text-ink-2">{reading.sentence}</p>
        </div>

        {reading.series && (
          <div className="border-t border-hairline pt-3">
            <Chart history={history} read={reading.series} />
          </div>
        )}

        {(reading.fills.length > 0 || reading.drains.length > 0) && (
          <div className="flex flex-col gap-3 border-t border-hairline pt-3">
            {reading.fills.length > 0 && <Flows title="What fills it" flows={reading.fills} />}
            {reading.drains.length > 0 && <Flows title="What drains it" flows={reading.drains} />}
          </div>
        )}
      </div>
    </Drawer>
  );
}
