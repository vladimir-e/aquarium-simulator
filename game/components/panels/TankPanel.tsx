/**
 * TankPanel - Tank information display
 *
 * Future content:
 * - Tank size and volume
 * - Water level
 * - Temperature
 * - Current time of day effects
 */
function TankPanel(): React.ReactElement {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="tabpanel"
      id="panel-tank"
      aria-label="Tank information"
    >
      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-[--color-text-secondary]">Tank Size</h3>
        <p className="text-2xl font-bold text-[--color-text-primary]">20 gal</p>
        <p className="text-sm text-[--color-text-muted]">75.7 liters</p>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-[--color-text-secondary]">Water Level</h3>
        <p className="text-2xl font-bold text-[--color-text-primary]">98%</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[--color-bg-secondary]">
          <div
            className="h-full rounded-full bg-[--color-water-mid]"
            style={{ width: '98%' }}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-[--color-text-secondary]">Temperature</h3>
        <p className="text-2xl font-bold text-[--color-text-primary]">78°F</p>
        <p className="text-sm text-[--color-text-muted]">25.5°C</p>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-[--color-text-secondary]">Time of Day</h3>
        <p className="text-2xl font-bold text-[--color-text-primary]">Day</p>
        <p className="text-sm text-[--color-text-muted]">Lights on</p>
      </div>
    </div>
  );
}

export default TankPanel;
