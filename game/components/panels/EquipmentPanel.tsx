/**
 * EquipmentPanel - Equipment list and controls
 *
 * Future content:
 * - Filter status
 * - Heater/chiller
 * - Lights
 * - CO2 system
 * - ATO
 * - Air pump
 */
function EquipmentPanel(): React.ReactElement {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="tabpanel"
      id="panel-equipment"
      aria-label="Equipment list"
    >
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[--color-text-secondary]">Filter</h3>
          <span className="badge badge-healthy">Running</span>
        </div>
        <p className="text-lg font-medium text-[--color-text-primary]">HOB Filter</p>
        <p className="text-sm text-[--color-text-muted]">200 GPH flow rate</p>
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[--color-text-secondary]">Heater</h3>
          <span className="badge badge-healthy">Active</span>
        </div>
        <p className="text-lg font-medium text-[--color-text-primary]">100W Heater</p>
        <p className="text-sm text-[--color-text-muted]">Set to 78°F</p>
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[--color-text-secondary]">Light</h3>
          <span className="badge badge-healthy">On</span>
        </div>
        <p className="text-lg font-medium text-[--color-text-primary]">LED Light</p>
        <p className="text-sm text-[--color-text-muted]">8:00 AM - 8:00 PM</p>
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[--color-text-secondary]">ATO</h3>
          <span className="badge badge-healthy">Standby</span>
        </div>
        <p className="text-lg font-medium text-[--color-text-primary]">Auto Top-Off</p>
        <p className="text-sm text-[--color-text-muted]">Reservoir full</p>
      </div>
    </div>
  );
}

export default EquipmentPanel;
