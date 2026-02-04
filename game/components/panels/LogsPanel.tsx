/**
 * LogsPanel - Terminal-style event log display
 *
 * Features:
 * - Full-height scrollable log view
 * - Color-coded log types (user, system, warning)
 * - Monospace font for readability
 */
function LogsPanel(): React.ReactElement {
  // Placeholder log entries mimicking the simulation log style
  const logs = [
    { id: '1', tick: 510, source: 'user', message: 'Water change: 25% (removed 10.0L, added 10.0L)' },
    { id: '2', tick: 507, source: 'user', message: 'Water change: 25% (removed 10.0L, added 10.1L)' },
    { id: '3', tick: 503, source: 'user', message: 'Water change: 25% (removed 10.0L, added 10.1L)' },
    { id: '4', tick: 462, source: 'user', message: 'Tap water temperature: 19.4°C → 20°C' },
    { id: '5', tick: 446, source: 'user', message: 'Tap water temperature: 20°C → 19.4°C' },
    { id: '6', tick: 432, source: 'user', message: 'Tap water pH: 6.6 → 6.5' },
    { id: '7', tick: 414, source: 'user', message: 'Tap water pH: 6.5 → 6.6' },
    { id: '8', tick: 302, source: 'algae', message: 'High algae level: 80.6 - consider reducing light or scrubbing', type: 'warning' },
    { id: '9', tick: 285, source: 'system', message: 'Temperature stable at 25.5°C' },
    { id: '10', tick: 240, source: 'system', message: 'Lights turned on (photoperiod start)' },
    { id: '11', tick: 180, source: 'equipment', message: 'Filter running normally' },
    { id: '12', tick: 120, source: 'system', message: 'Simulation started' },
  ];

  const getSourceColor = (source: string, type?: string): string => {
    if (type === 'warning') return 'text-yellow-400';
    switch (source) {
      case 'user':
        return 'text-sky-400';
      case 'algae':
        return 'text-yellow-400';
      case 'equipment':
        return 'text-emerald-400';
      default:
        return 'text-slate-400';
    }
  };

  const getMessageColor = (type?: string): string => {
    if (type === 'warning') return 'text-yellow-300';
    return 'text-slate-200';
  };

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      role="tabpanel"
      id="panel-logs"
      aria-label="Event logs"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[--color-text-secondary]">Log</h3>
      </div>

      {/* Terminal-style log container */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-900 p-4 font-mono text-sm">
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2 leading-relaxed">
              <span className="flex-shrink-0 text-slate-500">Tick {log.tick.toString().padStart(3, ' ')}</span>
              <span className={`flex-shrink-0 ${getSourceColor(log.source, log.type)}`}>
                [{log.source}]
              </span>
              <span className={getMessageColor(log.type)}>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LogsPanel;
