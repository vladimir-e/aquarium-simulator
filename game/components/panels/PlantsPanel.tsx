import { X, Leaf } from 'lucide-react';

/**
 * PlantsPanel - Plant list with health status
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
        <div key={plant.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
                <Leaf className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{plant.name}</h3>
                <span className="text-sm text-slate-500">{plant.size}% grown</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {plant.status}
              </span>
              <button
                className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={`Remove ${plant.name}`}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-xs font-medium text-slate-500">Size</span>
                <span className="text-xs font-semibold text-slate-700">{plant.size}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${plant.size}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-xs font-medium text-slate-500">Condition</span>
                <span className="text-xs font-semibold text-slate-700">{plant.condition}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
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
