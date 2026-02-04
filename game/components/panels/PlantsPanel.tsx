import { X, Leaf } from 'lucide-react';

/**
 * PlantsPanel - Plant list with health status (mobile-first layout)
 */
function PlantsPanel(): React.ReactElement {
  const plants = [
    { id: '1', name: 'Java Fern', size: 57, condition: 85, status: 'Thriving' },
    { id: '2', name: 'Java Fern', size: 55, condition: 82, status: 'Thriving' },
    { id: '3', name: 'Anubias', size: 53, condition: 90, status: 'Thriving' },
  ];

  return (
    <div
      className="space-y-3"
      role="tabpanel"
      id="panel-plants"
      aria-label="Plants list"
    >
      {plants.map((plant) => (
        <div key={plant.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Leaf className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-[--color-text-primary]">{plant.name}</h3>
                <span className="text-xs text-[--color-text-muted]">{plant.size}% size</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[--color-status-healthy-bg] px-2.5 py-1 text-xs font-medium text-[--color-status-healthy]">
                {plant.status}
              </span>
              <button
                className="focus-ring rounded-lg p-1.5 text-[--color-text-muted] hover:bg-[--color-bg-secondary]"
                aria-label={`Remove ${plant.name}`}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-[--color-text-muted]">Size</span>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[--color-bg-secondary]">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${plant.size}%` }}
                />
              </div>
            </div>
            <div>
              <span className="text-xs text-[--color-text-muted]">Condition</span>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[--color-bg-secondary]">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${plant.condition}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PlantsPanel;
