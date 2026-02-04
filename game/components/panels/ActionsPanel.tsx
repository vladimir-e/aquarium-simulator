import { Droplets, Fish, Scissors, Sparkles, Trash2, FlaskConical, ChevronRight } from 'lucide-react';

/**
 * ActionsPanel - User action buttons (mobile-first layout)
 */
function ActionsPanel(): React.ReactElement {
  const actions = [
    { id: 'feed', label: 'Feed Fish', icon: Fish, color: 'bg-orange-50 text-orange-500' },
    { id: 'water-change', label: 'Water Change', icon: Droplets, color: 'bg-sky-50 text-sky-500' },
    { id: 'top-off', label: 'Top Off', icon: Droplets, color: 'bg-cyan-50 text-cyan-500' },
    { id: 'dose', label: 'Dose Fertilizer', icon: FlaskConical, color: 'bg-emerald-50 text-emerald-500' },
    { id: 'scrub', label: 'Scrub Algae', icon: Sparkles, color: 'bg-yellow-50 text-yellow-600' },
    { id: 'trim', label: 'Trim Plants', icon: Scissors, color: 'bg-green-50 text-green-500' },
    { id: 'clean', label: 'Clean Filter', icon: Trash2, color: 'bg-slate-100 text-slate-500' },
  ];

  return (
    <div
      className="space-y-2"
      role="tabpanel"
      id="panel-actions"
      aria-label="Actions"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          className="focus-ring flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98]"
          type="button"
        >
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${action.color}`}>
            <action.icon className="h-5 w-5" />
          </div>
          <span className="flex-1 font-medium text-[--color-text-primary]">{action.label}</span>
          <ChevronRight className="h-5 w-5 text-[--color-text-muted]" />
        </button>
      ))}
    </div>
  );
}

export default ActionsPanel;
