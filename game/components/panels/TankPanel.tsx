import { Droplet, Thermometer, Sun, Box } from 'lucide-react';

/**
 * TankPanel - Tank information display (mobile-first grid)
 */
function TankPanel(): React.ReactElement {
  const stats = [
    { icon: Box, label: 'Tank Size', value: '20 gal', sub: '75.7 liters' },
    { icon: Droplet, label: 'Water Level', value: '98%', progress: 98 },
    { icon: Thermometer, label: 'Temperature', value: '78°F', sub: '25.5°C' },
    { icon: Sun, label: 'Time of Day', value: 'Day', sub: 'Lights on' },
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
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <stat.icon className="h-4 w-4 text-[--color-text-muted]" />
            <span className="text-xs font-medium text-[--color-text-secondary]">{stat.label}</span>
          </div>
          <p className="text-xl font-bold text-[--color-text-primary]">{stat.value}</p>
          {stat.sub && (
            <p className="text-xs text-[--color-text-muted]">{stat.sub}</p>
          )}
          {stat.progress !== undefined && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[--color-bg-secondary]">
              <div
                className="h-full rounded-full bg-[--color-water-mid]"
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
