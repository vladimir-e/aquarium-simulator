import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { LogEntry } from '../../../simulation/index.js';
import { LogStripShell } from '../run/LogStripShell';

/**
 * Build's bottom statusline: the explanatory bar in Run's shared log strip. On
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
  return (
    <LogStripShell
      logs={logs}
      trailing={
        <button
          type="button"
          onClick={onResumeRun}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-control bg-accent px-3 py-2 font-sans text-[13px] font-medium text-surface transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:hidden"
        >
          Resume run
          <ChevronRight className="h-4 w-4" />
        </button>
      }
    >
      <span className="truncate text-ink-2">
        <span className="hidden sm:inline">Build changes log as </span>
        <span className="sm:hidden">changes log as </span>
        <span className="text-accent">[user]</span>
        <span className="hidden sm:inline"> events · sim paused while building</span>
      </span>
    </LogStripShell>
  );
}
