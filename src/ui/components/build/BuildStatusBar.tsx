import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { LogEntry } from '../../../simulation/index.js';
import { recentLogs } from '../../run';

function LogLine({ log }: { log: LogEntry }): React.JSX.Element {
  return (
    <div className="py-0.5 font-mono text-[12.5px] leading-relaxed">
      <span className="text-ink-3">T{log.tick}</span>{' '}
      <span className="text-ink-2">[{log.source}]</span>{' '}
      <span className={log.severity === 'warning' ? 'text-alert-text' : 'text-ink'}>{log.message}</span>
    </div>
  );
}

/**
 * Build's bottom statusline — the mockup's explanatory bar, styled like Run's
 * log strip. `log ▲` expands the recent events you generate while editing. On
 * mobile it also carries the `Resume run` exit ramp (the desktop lives in the
 * Stocking footer), so leaving Build stays one tap away above the tab bar.
 */
export function BuildStatusBar({
  logs,
  onResumeRun,
}: {
  logs: LogEntry[];
  onResumeRun: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const recent = recentLogs(logs, 100);

  return (
    <div className="sticky bottom-[var(--tabbar-h)] z-10 border-t border-hairline-2 bg-surface">
      {open && (
        <div className="max-h-64 overflow-y-auto border-b border-hairline px-4 py-2">
          {recent.length === 0 ? (
            <p className="font-mono text-[12.5px] text-ink-3">No events yet.</p>
          ) : (
            recent.map((log, i) => <LogLine key={`${log.tick}-${i}`} log={log} />)
          )}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2 font-mono text-[12.5px]">
        <span className="truncate text-ink-2">
          <span className="hidden sm:inline">Build changes log as </span>
          <span className="sm:hidden">changes log as </span>
          <span className="text-accent">[user]</span>
          <span className="hidden sm:inline"> events · sim paused while building</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse event log' : 'Expand event log'}
          className="ml-auto flex shrink-0 items-center gap-1 rounded text-ink-3 transition-colors hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          log {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onResumeRun}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-control bg-accent px-3 py-2 font-sans text-[13px] font-medium text-surface transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:hidden"
        >
          Resume run
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
