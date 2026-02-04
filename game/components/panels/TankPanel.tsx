import { Droplet, Thermometer, Sun, Box } from 'lucide-react';

/**
 * TankPanel - Tank information display with high contrast cards
 */
function TankPanel(): React.ReactElement {
  const stats = [
    { icon: Box, label: 'Tank Size', value: '20 gal', sub: '75.7 liters', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { icon: Droplet, label: 'Water Level', value: '98%', progress: 98, color: 'text-sky-600', bg: 'bg-sky-50' },
    { icon: Thermometer, label: 'Temperature', value: '78°F', sub: '25.5°C', color: 'text-rose-600', bg: 'bg-rose-50' },
    { icon: Sun, label: 'Time of Day', value: 'Day', sub: 'Lights on', color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3"
      role="tabpanel"
      id="panel-tank"
      aria-label="Tank information"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className={`rounded-lg p-1.5 ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          {stat.sub && (
            <p className="text-sm text-slate-500">{stat.sub}</p>
          )}
          {stat.progress !== undefined && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${stat.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default TankPanel;
