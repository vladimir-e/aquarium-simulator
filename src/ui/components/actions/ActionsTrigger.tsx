import React from 'react';
import { ChevronUp, Zap } from 'lucide-react';
import { CONTROL_FOCUS } from '../ui/focus';

/**
 * Docked at the foot of whichever column persists — the rail where it stands,
 * the stage where it does not. It carries the promoted verb so the sheet's
 * state is legible while the sheet is shut.
 */
export function ActionsTrigger({
  label,
  open,
  onClick,
}: {
  /** The promoted verb and its setting, e.g. "Feed 0.5 g". */
  label: string;
  open: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-card border px-3 text-[13.5px] font-semibold transition-colors ${CONTROL_FOCUS} ${
        open
          ? 'border-accent bg-accent-tint text-accent'
          : 'border-hairline-2 bg-surface-2 text-ink hover:border-ink-3'
      }`}
    >
      <Zap aria-hidden className={`h-4 w-4 ${open ? 'text-accent' : 'text-ink-2'}`} />
      Actions
      <span className="ml-auto min-w-0 truncate font-mono text-[11px] font-normal text-ink-3">
        {label}
      </span>
      <ChevronUp
        aria-hidden
        className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
