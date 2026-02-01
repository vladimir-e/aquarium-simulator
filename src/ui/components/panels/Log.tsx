import React from 'react';
import { Terminal } from 'lucide-react';
import { Panel } from '../layout/Panel';
import type { LogEntry, SimulationState } from '../../../simulation/index.js';

interface LogProps {
  logs: LogEntry[];
  state: SimulationState;
}

export function Log({ logs, state }: LogProps): React.JSX.Element {
  const handleDebug = (): void => {
    // eslint-disable-next-line no-console
    console.log('Simulation State:', state);
    window.alert('State has been printed to browser console');
  };

  return (
    <Panel
      title="Log"
      action={
        <button
          onClick={handleDebug}
          className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded bg-border hover:bg-gray-600 flex items-center gap-1.5"
        >
          <Terminal className="w-3.5 h-3.5" />
          Debug
        </button>
      }
    >
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {logs.length === 0 && (
          <div className="text-xs text-gray-400">No events yet</div>
        )}

        {logs
          .slice()
          .reverse()
          .map((log, index) => (
            <div key={`${log.tick}-${index}`} className="text-xs font-mono">
              <span className="text-gray-500">Tick {log.tick}</span>{' '}
              <span
                className={
                  log.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                }
              >
                [{log.source}]
              </span>{' '}
              <span
                className={
                  log.severity === 'warning' ? 'text-yellow-300' : 'text-gray-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))}
      </div>
    </Panel>
  );
}
