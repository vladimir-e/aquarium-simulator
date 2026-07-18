import React, { useEffect, useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import type { LogEntry } from '../../../simulation/index.js';
import { Segmented } from '../ui/Segmented';
import {
  type LogCategory,
  type LogFilter,
  LOG_FILTERS,
  CATEGORY_LABEL,
  categorizeLog,
  filterLogs,
  isAlertLog,
  nearestLogIndexAtOrBefore,
  formatLogExport,
  LOG_EXPORT_FILENAME,
} from '../../review/index.js';

const FILTER_OPTIONS = LOG_FILTERS.map((value) => ({ value, label: value }));

const CATEGORY_TINT: Record<LogCategory, string> = {
  cycle: 'text-ink-2',
  user: 'text-accent',
  life: 'text-ok-text',
  sim: 'text-ink-3',
};

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

interface ReviewLogPanelProps {
  /** Window-scoped log lines, ascending by tick. */
  windowLogs: LogEntry[];
  /** Whole-run log, for the export (the full transcript, not the window). */
  allLogs: LogEntry[];
  filter: LogFilter;
  onFilterChange: (filter: LogFilter) => void;
  currentTick: number;
  onScrubToTick: (tick: number) => void;
}

export function ReviewLogPanel({
  windowLogs,
  allLogs,
  filter,
  onFilterChange,
  currentTick,
  onScrubToTick,
}: ReviewLogPanelProps): React.JSX.Element {
  const shown = useMemo(() => filterLogs(windowLogs, filter), [windowLogs, filter]);
  const activeIndex = nearestLogIndexAtOrBefore(shown, currentTick);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filter]);

  return (
    <section className="flex h-full flex-col rounded-card border border-hairline bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <h3 className="text-[15px] font-semibold leading-none text-ink">Log</h3>
        <Segmented ariaLabel="Log category" options={FILTER_OPTIONS} value={filter} onChange={onFilterChange} />
      </div>

      <div className="min-h-[240px] flex-1 overflow-y-auto px-2 py-1.5">
        {shown.length === 0 ? (
          <p className="px-2 py-2 font-mono text-[12.5px] text-ink-3">No events in this view.</p>
        ) : (
          shown
            .map((log, ascIndex) => ({ log, ascIndex }))
            .reverse()
            .map(({ log, ascIndex }) => {
              const active = ascIndex === activeIndex;
              const alert = isAlertLog(log);
              return (
                <button
                  key={`${log.tick}-${ascIndex}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => onScrubToTick(log.tick)}
                  aria-current={active}
                  className={`flex w-full items-baseline gap-1.5 rounded px-2 py-1 text-left font-mono text-[12.5px] leading-relaxed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    active ? 'bg-accent-tint' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="shrink-0 tabular-nums text-ink-3">{log.tick}</span>
                  <span className={`shrink-0 ${CATEGORY_TINT[categorizeLog(log)]}`}>
                    [{CATEGORY_LABEL[categorizeLog(log)]}]
                  </span>
                  <span className={alert ? 'text-alert-text' : 'text-ink'}>{log.message}</span>
                </button>
              );
            })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2">
        <span className="text-[12px] text-ink-3">click a line — the scrubber jumps there</span>
        <button
          type="button"
          onClick={() => downloadLog(allLogs)}
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Download className="h-3.5 w-3.5" />
          export
        </button>
      </div>
    </section>
  );
}
