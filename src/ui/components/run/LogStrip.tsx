import React from 'react';
import type { LogEntry } from '../../../simulation/index.js';
import { latestLog } from '../../run';
import { LogStripShell } from './LogStripShell';

export function LogStrip({ logs }: { logs: LogEntry[] }): React.JSX.Element {
  const latest = latestLog(logs);

  return (
    <LogStripShell logs={logs}>
      {latest ? (
        <>
          <span className="shrink-0 text-ink-3">T{latest.tick}</span>
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${latest.severity === 'warning' ? 'bg-alert' : 'bg-ink-3'}`}
          />
          <span className="shrink-0 text-ink-2">[{latest.source}]</span>
          <span className={`truncate ${latest.severity === 'warning' ? 'text-alert-text' : 'text-ink'}`}>
            {latest.message}
          </span>
        </>
      ) : (
        <span className="text-ink-3">No events yet.</span>
      )}
    </LogStripShell>
  );
}
