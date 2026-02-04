import { X } from 'lucide-react';

/**
 * PlantsPanel - Plant list with health status
 *
 * Future content:
 * - Individual plant specimens
 * - Growth status
 * - Condition indicators
 * - Add/remove plants
 */
function PlantsPanel(): React.ReactElement {
  // Placeholder plant data
  const plants = [
    { id: '1', name: 'Java Fern', size: 57, condition: 85, status: 'Thriving' },
    { id: '2', name: 'Java Fern', size: 55, condition: 82, status: 'Thriving' },
    { id: '3', name: 'Anubias', size: 53, condition: 90, status: 'Thriving' },
  ];

  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="tabpanel"
      id="panel-plants"
      aria-label="Plants list"
    >
      {plants.map((plant) => (
        <div key={plant.id} className="card">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="font-medium text-[--color-text-primary]">{plant.name}</h3>
              <span className="text-sm text-[--color-text-muted]">{plant.size}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-healthy">{plant.status}</span>
              <button
                className="focus-ring rounded p-1 text-[--color-text-muted] hover:bg-[--color-bg-secondary] hover:text-[--color-text-primary]"
                aria-label={`Remove ${plant.name}`}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-[--color-text-muted]">Size</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[--color-bg-secondary]">
                <div
                  className="h-full rounded-full bg-[--color-status-healthy]"
                  style={{ width: `${plant.size}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-[--color-text-muted]">Cond</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[--color-bg-secondary]">
                <div
                  className="h-full rounded-full bg-[--color-status-healthy]"
                  style={{ width: `${plant.condition}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Add plant placeholder */}
      <div className="card flex flex-col items-center justify-center border-2 border-dashed border-[--color-border-light] bg-transparent text-center">
        <p className="text-sm text-[--color-text-muted]">Add a plant</p>
        <p className="text-xs text-[--color-text-muted]">(Coming soon)</p>
      </div>
    </div>
  );
}

export default PlantsPanel;
