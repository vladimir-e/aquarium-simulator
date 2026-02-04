import { AlertTriangle, Info, Droplets } from 'lucide-react';

/**
 * LogsPanel - Event log display with scrollable list
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

  const getLogIcon = (type: string): React.ReactElement => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'action':
        return <Droplets className="h-4 w-4 text-teal-500" />;
      default:
        return <Info className="h-4 w-4 text-slate-400" />;
    }
  };

  const getLogStyle = (type: string): string => {
    switch (type) {
      case 'warning':
        return 'border-l-amber-500 bg-amber-50';
      case 'action':
        return 'border-l-teal-500 bg-teal-50';
      default:
        return 'border-l-slate-300 bg-white';
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      role="tabpanel"
      id="panel-logs"
      aria-label="Event logs"
    >
      {/* Scrollable log list */}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${getLogStyle(log.type)}`}
          >
            <div className="mt-0.5 flex-shrink-0">{getLogIcon(log.type)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{log.message}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Day {log.day}, {log.time} · {log.source}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LogsPanel;
