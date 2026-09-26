import React from 'react';
import { STATUS_SEVERITY, type Status } from '../../run';

const DOT: Record<Status, string> = {
  ok: 'bg-ink-3',
  neutral: 'bg-ink-3',
  warn: 'bg-warn',
  alert: 'bg-alert',
};

/** Two lines of dots at the narrowest cell a strip sits in, so it never outgrows its row. */
const MAX_DOTS = 18;

const WORST_FIRST: Status[] = ['alert', 'warn', 'ok'];

/**
 * One dot per member, so a dozen tetras read at a glance: ink while one is
 * fine, the engine's own severity when it is not. A group is as urgent as its
 * worst member, and this is where that shows without sorting anything. Past
 * two lines the dots fold into one bar, each tone at its share, worst first.
 */
export function DotStrip({
  statuses,
  label,
}: {
  statuses: Status[];
  label: string;
}): React.JSX.Element {
  if (statuses.length <= MAX_DOTS) {
    return (
      <span className="flex flex-wrap items-center gap-[3px]" role="img" aria-label={label}>
        {statuses.map((status, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
        ))}
      </span>
    );
  }

  const shares = WORST_FIRST.map((tone) => ({
    tone,
    count: statuses.filter((status) => STATUS_SEVERITY[status] === STATUS_SEVERITY[tone]).length,
  })).filter((share) => share.count > 0);

  return (
    <span className="flex h-1.5 w-full gap-[3px]" role="img" aria-label={label}>
      {shares.map(({ tone, count }) => (
        <span
          key={tone}
          className={`min-w-1.5 basis-0 rounded-full ${DOT[tone]}`}
          style={{ flexGrow: count }}
        />
      ))}
    </span>
  );
}
