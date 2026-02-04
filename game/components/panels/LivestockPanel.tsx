import { X, Fish } from 'lucide-react';

/**
 * LivestockPanel - Fish and invertebrate list (mobile-first layout)
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
        <div key={animal.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
                <Fish className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <h3 className="font-semibold text-[--color-text-primary]">{animal.name}</h3>
                <span className="text-xs text-[--color-text-muted]">x{animal.count}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[--color-status-healthy-bg] px-2.5 py-1 text-xs font-medium text-[--color-status-healthy]">
                {animal.status}
              </span>
              <button
                className="focus-ring rounded-lg p-1.5 text-[--color-text-muted] hover:bg-[--color-bg-secondary]"
                aria-label={`Remove ${animal.name}`}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[--color-text-muted]">Health</span>
              <span className="font-medium text-[--color-text-secondary]">{animal.health}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[--color-bg-secondary]">
              <div
                className="h-full rounded-full bg-[--color-status-healthy]"
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
