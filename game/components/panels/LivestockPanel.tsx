import { X, Fish } from 'lucide-react';

/**
 * LivestockPanel - Fish and invertebrate list
 */
function LivestockPanel(): React.ReactElement {
  const livestock = [
    { id: '1', name: 'Neon Tetra', count: 6, health: 95, status: 'Healthy' },
    { id: '2', name: 'Corydoras', count: 4, health: 92, status: 'Healthy' },
    { id: '3', name: 'Mystery Snail', count: 2, health: 88, status: 'Healthy' },
  ];

  return (
    <div
      className="space-y-3"
      role="tabpanel"
      id="panel-livestock"
      aria-label="Livestock list"
    >
      {livestock.map((animal) => (
        <div key={animal.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100">
                <Fish className="h-6 w-6 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{animal.name}</h3>
                <span className="text-sm text-slate-500">x{animal.count}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {animal.status}
              </span>
              <button
                className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={`Remove ${animal.name}`}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between">
              <span className="text-xs font-medium text-slate-500">Health</span>
              <span className="text-xs font-semibold text-slate-700">{animal.health}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${animal.health}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default LivestockPanel;
