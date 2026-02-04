/**
 * LogsPanel - Compact event log display
 */
function LogsPanel(): React.ReactElement {
  const logs = [
    { id: '1', time: '11:00', day: 1, type: 'action', source: 'user', message: 'Water change: 25% (removed 10.0L, added 10.0L)' },
    { id: '2', time: '10:45', day: 1, type: 'action', source: 'user', message: 'Fed fish - 2 portions' },
    { id: '3', time: '10:30', day: 1, type: 'warning', source: 'algae', message: 'High algae level: 80.6 - consider reducing light' },
    { id: '4', time: '10:00', day: 1, type: 'info', source: 'system', message: 'Temperature stable at 25.5°C' },
    { id: '5', time: '09:00', day: 1, type: 'info', source: 'system', message: 'Lights turned on' },
    { id: '6', time: '08:30', day: 1, type: 'info', source: 'equipment', message: 'Filter running normally' },
    { id: '7', time: '08:00', day: 1, type: 'info', source: 'system', message: 'Simulation started' },
    { id: '8', time: '23:00', day: 0, type: 'info', source: 'system', message: 'Lights turned off' },
    { id: '9', time: '22:00', day: 0, type: 'action', source: 'user', message: 'Fed fish - 1 portion' },
    { id: '10', time: '20:00', day: 0, type: 'warning', source: 'water', message: 'Water level at 95%' },
  ];

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'warning':
        return 'text-amber-600';
      case 'action':
        return 'text-teal-600';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      role="tabpanel"
      id="panel-logs"
      aria-label="Event logs"
    >
      {/* Compact scrollable log list */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-baseline gap-2 px-3 py-2 text-sm"
            >
              <span className="flex-shrink-0 text-xs text-slate-400">
                D{log.day} {log.time}
              </span>
              <span className={`flex-shrink-0 text-xs font-medium ${getTypeColor(log.type)}`}>
                [{log.source}]
              </span>
              <span className="text-slate-700">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LogsPanel;
