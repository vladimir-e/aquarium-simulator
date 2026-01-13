import React from 'react';
import { Panel } from '../layout/Panel';
import { useSimulation } from '../../hooks/useSimulation';

export function Log(): React.JSX.Element {
  const { state } = useSimulation();
  const logs = state.logs;

  return (
    <Panel title="Log">
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
