/**
 * EquipmentPanel - Equipment list and controls (mobile-first layout)
 */
function EquipmentPanel(): React.ReactElement {
  const equipment = [
    { id: 'filter', name: 'HOB Filter', type: 'Filter', status: 'Running', detail: '200 GPH flow rate' },
    { id: 'heater', name: '100W Heater', type: 'Heater', status: 'Active', detail: 'Set to 78°F' },
    { id: 'light', name: 'LED Light', type: 'Light', status: 'On', detail: '8:00 AM - 8:00 PM' },
    { id: 'ato', name: 'Auto Top-Off', type: 'ATO', status: 'Standby', detail: 'Reservoir full' },
  ];

  return (
    <div
      className="space-y-3"
      role="tabpanel"
      id="panel-equipment"
      aria-label="Equipment list"
    >
      {equipment.map((item) => (
        <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[--color-text-muted]">{item.type}</span>
              <span className="rounded-full bg-[--color-status-healthy-bg] px-2 py-0.5 text-xs font-medium text-[--color-status-healthy]">
                {item.status}
              </span>
            </div>
            <p className="font-semibold text-[--color-text-primary]">{item.name}</p>
            <p className="text-xs text-[--color-text-muted]">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default EquipmentPanel;
