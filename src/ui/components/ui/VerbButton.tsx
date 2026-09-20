import React from 'react';
import { CONTROL_FOCUS } from './focus';

/**
 * A verb where the thing it moves is read. The same control appears in the Act
 * palette; here it carries the amount it would use, so the footer of a widget
 * says what would happen rather than opening a menu to ask.
 */
export function VerbButton({
  label,
  onClick,
  hot = false,
  className = '',
}: {
  label: string;
  onClick: () => void;
  /** The one verb the tank is asking for right now. */
  hot?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center rounded-control px-2.5 text-[13px] transition-colors ${CONTROL_FOCUS} ${
        hot
          ? 'bg-accent-tint font-medium text-accent'
          : 'border border-hairline text-ink hover:bg-surface-2'
      } ${className}`}
    >
      {label}
    </button>
  );
}
