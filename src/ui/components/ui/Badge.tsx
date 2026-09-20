import React from 'react';

export type BadgeTone = 'accent' | 'warn' | 'alert';

const BADGE_TONE: Record<BadgeTone, string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  alert: 'bg-alert',
};

/** A count against a control: what it has to answer, or what has been changed on it. */
export function Badge({ count, tone }: { count: number; tone: BadgeTone }): React.JSX.Element {
  return (
    <span
      className={`min-w-4 rounded-full px-1.5 text-center text-[11px] font-medium leading-4 tabular-nums text-accent-ink ${BADGE_TONE[tone]}`}
    >
      {count}
    </span>
  );
}
