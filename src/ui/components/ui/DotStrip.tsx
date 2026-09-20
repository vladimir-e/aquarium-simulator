import React from 'react';
import type { Status } from '../../run';

const DOT: Record<Status, string> = {
  ok: 'bg-ink-3',
  neutral: 'bg-ink-3',
  warn: 'bg-warn',
  alert: 'bg-alert',
};

/**
 * One dot per individual, so a dozen tetras read at a glance: ink while a fish
 * is fine, the engine's own severity when it is not. A group is as urgent as
 * its worst member, and this is where that shows without sorting anything.
 */
export function DotStrip({
  statuses,
  label,
}: {
  statuses: Status[];
  label: string;
}): React.JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-[3px]" role="img" aria-label={label}>
      {statuses.map((status, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      ))}
    </span>
  );
}
