import { Droplets, Fish, Scissors, Sparkles, Trash2, FlaskConical, ChevronRight } from 'lucide-react';

/**
 * ActionsPanel - User action buttons with colorful icons
 */
function ActionsPanel(): React.ReactElement {
  const actions = [
    { id: 'feed', label: 'Feed Fish', icon: Fish, iconColor: 'text-orange-600', bg: 'bg-orange-100' },
    { id: 'water-change', label: 'Water Change', icon: Droplets, iconColor: 'text-sky-600', bg: 'bg-sky-100' },
    { id: 'top-off', label: 'Top Off', icon: Droplets, iconColor: 'text-cyan-600', bg: 'bg-cyan-100' },
    { id: 'dose', label: 'Dose Fertilizer', icon: FlaskConical, iconColor: 'text-emerald-600', bg: 'bg-emerald-100' },
    { id: 'scrub', label: 'Scrub Algae', icon: Sparkles, iconColor: 'text-amber-600', bg: 'bg-amber-100' },
    { id: 'trim', label: 'Trim Plants', icon: Scissors, iconColor: 'text-green-600', bg: 'bg-green-100' },
    { id: 'clean', label: 'Clean Filter', icon: Trash2, iconColor: 'text-slate-600', bg: 'bg-slate-200' },
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
          className="focus-ring flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50 active:scale-[0.99]"
          type="button"
        >
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${action.bg}`}>
            <action.icon className={`h-6 w-6 ${action.iconColor}`} />
          </div>
          <span className="flex-1 font-semibold text-slate-900">{action.label}</span>
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </button>
      ))}
    </div>
  );
}

export default ActionsPanel;
