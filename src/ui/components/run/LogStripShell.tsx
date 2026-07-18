import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LogEntry } from '../../../simulation/index.js';
import { recentLogs } from '../../run';

export function LogLine({ log }: { log: LogEntry }): React.JSX.Element {
  return (
    <div className="py-0.5 font-mono text-[12.5px] leading-relaxed">
      <span className="text-ink-3">T{log.tick}</span>{' '}
      <span className="text-ink-2">[{log.source}]</span>{' '}
      <span className={log.severity === 'warning' ? 'text-alert-text' : 'text-ink'}>{log.message}</span>
    </div>
  );
}

/**
 * Sticky bottom strip shared by Run and Build: a one-line status bar (`children`)
 * with a `log ▲/▼` toggle that expands the recent event history above it.
 * `trailing` renders after the toggle — Build's mobile `Resume run` ramp.
 */
export function LogStripShell({
  logs,
  children,
  trailing,
}: {
  logs: LogEntry[];
  children: React.ReactNode;
  trailing?: React.ReactNode;
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
      <div className="flex items-center gap-3 px-4 py-2 font-mono text-[12.5px]">
        {children}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse event log' : 'Expand event log'}
          className="ml-auto flex shrink-0 items-center gap-1 rounded text-ink-3 transition-colors hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          log {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        {trailing}
      </div>
    </div>
  );
}
