import { Fan, Flame, Lightbulb, Droplets } from 'lucide-react';

/**
 * EquipmentPanel - Equipment list with status indicators
 */
function EquipmentPanel(): React.ReactElement {
  const equipment = [
    { id: 'filter', name: 'HOB Filter', type: 'Filter', status: 'Running', detail: '200 GPH flow rate', icon: Fan, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'heater', name: '100W Heater', type: 'Heater', status: 'Active', detail: 'Set to 78°F', icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'light', name: 'LED Light', type: 'Light', status: 'On', detail: '8:00 AM - 8:00 PM', icon: Lightbulb, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { id: 'ato', name: 'Auto Top-Off', type: 'ATO', status: 'Standby', detail: 'Reservoir full', icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  ];

  return (
    <div
      className="space-y-3"
      role="tabpanel"
      id="panel-equipment"
      aria-label="Equipment list"
    >
      {equipment.map((item) => (
        <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
            <item.icon className={`h-6 w-6 ${item.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">{item.name}</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {item.status}
              </span>
            </div>
            <p className="text-sm text-slate-500">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default EquipmentPanel;
