import { X } from 'lucide-react';

/**
 * LivestockPanel - Fish and invertebrate list
 *
 * Future content:
 * - Individual fish
 * - Colony organisms (snails, shrimp)
 * - Health indicators
 * - Feeding status
 */
function LivestockPanel(): React.ReactElement {
  // Placeholder livestock data
  const livestock = [
    { id: '1', name: 'Neon Tetra', count: 6, health: 95, status: 'Healthy' },
    { id: '2', name: 'Corydoras', count: 4, health: 92, status: 'Healthy' },
    { id: '3', name: 'Mystery Snail', count: 2, health: 88, status: 'Healthy' },
  ];

  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="tabpanel"
      id="panel-livestock"
      aria-label="Livestock list"
    >
      {livestock.map((animal) => (
        <div key={animal.id} className="card">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="font-medium text-[--color-text-primary]">{animal.name}</h3>
              <span className="text-sm text-[--color-text-muted]">x{animal.count}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-healthy">{animal.status}</span>
              <button
                className="focus-ring rounded p-1 text-[--color-text-muted] hover:bg-[--color-bg-secondary] hover:text-[--color-text-primary]"
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
              <span className="text-[--color-text-muted]">{animal.health}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[--color-bg-secondary]">
              <div
                className="h-full rounded-full bg-[--color-status-healthy]"
                style={{ width: `${animal.health}%` }}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add livestock placeholder */}
      <div className="card flex flex-col items-center justify-center border-2 border-dashed border-[--color-border-light] bg-transparent text-center">
        <p className="text-sm text-[--color-text-muted]">Add livestock</p>
        <p className="text-xs text-[--color-text-muted]">(Coming soon)</p>
      </div>
    </div>
  );
}

export default LivestockPanel;
