import { Droplets, Fish, Scissors, Sparkles, Trash2, FlaskConical } from 'lucide-react';

/**
 * ActionsPanel - User action buttons
 *
 * Future content:
 * - Feed fish
 * - Water change
 * - Top off
 * - Dose fertilizer
 * - Scrub algae
 * - Trim plants
 */
function ActionsPanel(): React.ReactElement {
  const actions = [
    { id: 'feed', label: 'Feed', icon: Fish, description: 'Feed your fish' },
    { id: 'water-change', label: 'Water Change', icon: Droplets, description: 'Partial water change' },
    { id: 'top-off', label: 'Top Off', icon: Droplets, description: 'Add water to compensate evaporation' },
    { id: 'dose', label: 'Dose', icon: FlaskConical, description: 'Add fertilizer' },
    { id: 'scrub', label: 'Scrub Algae', icon: Sparkles, description: 'Clean algae from glass' },
    { id: 'trim', label: 'Trim Plants', icon: Scissors, description: 'Prune overgrown plants' },
    { id: 'clean', label: 'Clean Filter', icon: Trash2, description: 'Maintenance cleaning' },
  ];

  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="tabpanel"
      id="panel-actions"
      aria-label="Actions"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          className="card focus-ring flex items-center gap-4 text-left transition-colors hover:bg-[--color-accent-light]"
          type="button"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[--color-accent-light]">
            <action.icon className="h-6 w-6 text-[--color-accent-primary]" />
          </div>
          <div>
            <h3 className="font-medium text-[--color-text-primary]">{action.label}</h3>
            <p className="text-sm text-[--color-text-muted]">{action.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

export default ActionsPanel;
