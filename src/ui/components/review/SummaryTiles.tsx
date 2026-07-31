import React from 'react';
import type { LogEntry } from '../../../simulation/index.js';
import type { RunAggregates } from '../../run/index.js';
import { useUnits } from '../../hooks/useUnits';
import { type SummaryTile, ALERT_LABEL, SUMMARY_ORDER, runSummary } from '../../review/index.js';
import { Pill } from '../run/elements';
import { CONTROL_FOCUS } from '../ui/focus';

/** A meta line that names a tick parks the cursor there when tapped. */
function MetaLine({
  tile,
  onScrubToTick,
  className,
}: {
  tile: SummaryTile;
  onScrubToTick: (tick: number) => void;
  className: string;
}): React.JSX.Element | null {
  const { meta, metaTick } = tile;
  if (meta === undefined) return null;
  if (metaTick === undefined) return <span className={className}>{meta}</span>;
  return (
    <button
      type="button"
      onClick={() => onScrubToTick(metaTick)}
      className={`-mx-1 rounded-badge px-1 py-1 underline decoration-dotted underline-offset-2 hover:text-ink ${className} ${CONTROL_FOCUS}`}
    >
      {meta}
    </button>
  );
}

export function SummaryTiles({
  aggregates,
  logs,
  onScrubToTick,
}: {
  aggregates: RunAggregates;
  logs: LogEntry[];
  onScrubToTick: (tick: number) => void;
}): React.JSX.Element {
  const { unitSystem } = useUnits();
  const tiles = runSummary(aggregates, logs, unitSystem);
  const ordered = SUMMARY_ORDER.map((id) => tiles[id]);

  return (
    <>
      <div className="hidden flex-wrap gap-2.5 sm:flex">
        {ordered.map((tile) => (
          <div
            key={tile.label}
            className="min-w-[112px] flex-1 rounded-card border border-hairline bg-surface px-3.5 py-2"
          >
            <div className="text-[12px] tracking-[0.03em] text-ink-3">{tile.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[20px] font-medium leading-none tabular-nums text-ink">
                {tile.value}
              </span>
              {tile.unit && (
                <span className="text-[11px] tracking-[0.04em] text-ink-3">{tile.unit}</span>
              )}
              {tile.alert && <Pill variant="alert">{ALERT_LABEL[tile.alert]}</Pill>}
            </div>
            <MetaLine
              tile={tile}
              onScrubToTick={onScrubToTick}
              className="mt-0.5 block font-mono text-[11px] tabular-nums text-ink-3"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 sm:hidden">
        {ordered.map((tile) => (
          <span
            key={tile.label}
            className="inline-flex items-center gap-1.5 rounded-badge border border-hairline bg-surface px-2.5 py-1 text-[12px] text-ink-2"
          >
            <span className="font-mono tabular-nums text-ink">{tile.value}</span>
            {tile.descriptor}
            {tile.alert && <Pill variant="alert">{ALERT_LABEL[tile.alert]}</Pill>}
          </span>
        ))}
      </div>
    </>
  );
}
