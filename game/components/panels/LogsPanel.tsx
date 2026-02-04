import { AlertTriangle, Info, CheckCircle } from 'lucide-react';

/**
 * LogsPanel - Event log display
 *
 * Future content:
 * - Simulation events
 * - Alerts and warnings
 * - User action history
 * - Filter by type
 */
function LogsPanel(): React.ReactElement {
  // Placeholder log entries
  const logs = [
    { id: '1', time: '11:00', day: 1, type: 'info', message: 'Simulation started' },
    { id: '2', time: '10:00', day: 1, type: 'action', message: 'Fed fish - 2 portions' },
    { id: '3', time: '09:00', day: 1, type: 'info', message: 'Lights turned on' },
    { id: '4', time: '08:00', day: 1, type: 'warning', message: 'Water level at 95%' },
    { id: '5', time: '07:00', day: 1, type: 'info', message: 'Temperature stable at 78°F' },
  ];

  const getLogIcon = (type: string): React.ReactElement => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-[--color-status-warning]" />;
      case 'action':
        return <CheckCircle className="h-4 w-4 text-[--color-status-healthy]" />;
      default:
        return <Info className="h-4 w-4 text-[--color-status-info]" />;
    }
  };

  return (
    <div
      className="space-y-2"
      role="tabpanel"
      id="panel-logs"
      aria-label="Event logs"
    >
      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-[--color-text-secondary]">Recent Events</h3>
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg bg-[--color-bg-secondary] p-3"
            >
              <div className="mt-0.5 flex-shrink-0">{getLogIcon(log.type)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[--color-text-primary]">{log.message}</p>
                <p className="text-xs text-[--color-text-muted]">
                  Day {log.day}, {log.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LogsPanel;
