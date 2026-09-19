import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { useStage } from '../components/layout/AppShell';
import { Widget } from '../components/ui/Widget';

/** The grid, as Vlad drew it: the cycle anchors top-left across two columns. */
const WIDGETS = [
  { title: 'Nitrogen', caption: 'waste to nitrate', to: '/water', span: true },
  { title: 'Life', caption: 'fish, plants, algae', to: '/life', span: false },
  { title: 'Water', caption: 'temperature, pH, level, gases', to: '/water', span: false },
  { title: 'Gear', caption: 'the rack and its schedules', to: '/gear', span: false },
  { title: 'Nutrients', caption: 'what the plants are eating', to: '/water', span: false },
];

export function OverviewSection(): React.JSX.Element {
  const { needs } = useStage();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {needs.length > 0 && (
        <section
          aria-label="Needs you"
          className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 rounded-card border border-hairline bg-surface px-3 py-2.5"
        >
          {needs.map((need) => (
            <span
              key={need.id}
              className={`flex items-center gap-1.5 text-[13px] font-medium ${
                need.tone === 'alert' ? 'text-alert' : 'text-warn'
              }`}
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              {need.text}
            </span>
          ))}
        </section>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-3 max-md:grid-cols-1">
        {WIDGETS.map((widget) => (
          <Widget
            key={widget.title}
            title={widget.title}
            caption={widget.caption}
            to={widget.to}
            className={widget.span ? 'col-span-2 max-md:col-span-1' : ''}
          >
            <div className="min-h-[140px]" />
          </Widget>
        ))}
      </div>
    </div>
  );
}
