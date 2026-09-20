import React, { useEffect, useMemo, useRef } from 'react';
import type { LogEntry } from '../../../simulation/index.js';
import {
  categorizeLog,
  filterLogs,
  isAlertLog,
  nearestLogIndexAtOrBefore,
  formatLogExport,
  LOG_EXPORT_FILENAME,
  LOG_FILTERS,
  type LogFilter,
} from '../../review';
import { Segmented } from '../ui/Segmented';
import { VerbButton } from '../ui/VerbButton';

const FILTER_OPTIONS = LOG_FILTERS.map((value) => ({ value, label: value }));

function downloadLog(logs: LogEntry[]): void {
  const blob = new globalThis.Blob([formatLogExport(logs)], { type: 'text/plain' });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = LOG_EXPORT_FILENAME;
  anchor.click();
  // Revoke after the click's download has a chance to start.
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 0);
}

interface LogLaneProps {
  /** Window-scoped log lines, ascending by tick. */
  logs: LogEntry[];
  filter: LogFilter;
  onFilter: (filter: LogFilter) => void;
  /** The parked tick — the line the lane stands on. */
  at: number;
  onPark: (tick: number) => void;
  className?: string;
}

/**
 * What the tank said, tick by tick. The one place mono is allowed: this is a
 * transcript, and a reader wants the column of ticks to line up. An entry
 * takes the colour its mark on the axis has — the keeper's own actions in
 * accent, what went wrong in alert — so the lane and the timeline read alike,
 * and tapping one parks the playhead on its tick.
 */
export function LogLane({
  logs,
  filter,
  onFilter,
  at,
  onPark,
  className = '',
}: LogLaneProps): React.JSX.Element {
  const shown = useMemo(() => filterLogs(logs, filter), [logs, filter]);
  const activeIndex = nearestLogIndexAtOrBefore(shown, at);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filter]);

  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex min-h-[26px] shrink-0 flex-wrap items-center gap-2 pb-1.5">
        <h2 className="text-[13px] font-medium leading-[18px] text-ink-2">Log</h2>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Segmented
            ariaLabel="Log category"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={onFilter}
          />
          <VerbButton label="Export log" onClick={() => downloadLog(shown)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline pt-1">
        {shown.length === 0 ? (
          <p className="px-1 py-2 text-[13px] text-ink-3">Nothing logged in this window.</p>
        ) : (
          shown
            .map((log, index) => ({ log, index }))
            .reverse()
            .map(({ log, index }) => {
              const active = index === activeIndex;
              const tone = isAlertLog(log)
                ? 'text-alert'
                : categorizeLog(log) === 'user'
                  ? 'text-accent'
                  : 'text-ink';
              return (
                <button
                  key={`${log.tick}-${index}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => onPark(log.tick)}
                  aria-current={active}
                  className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left font-mono text-[12px] leading-[17px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                    active ? 'bg-accent-tint' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="shrink-0 tabular-nums text-ink-3">{log.tick}</span>
                  <span className={tone}>{log.message}</span>
                </button>
              );
            })
        )}
      </div>
    </section>
  );
}
