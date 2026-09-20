import React from 'react';
import { CONTROL_FOCUS } from './focus';

/**
 * The one switch in the app, and it only ever means power. Accent because the
 * device is drawing current and the switch is interactive — never because the
 * device is healthy.
 */
export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`shrink-0 rounded-full ${CONTROL_FOCUS}`}
    >
      <span
        className={`relative block h-4 w-[26px] rounded-full border transition-colors motion-reduce:transition-none ${
          checked ? 'border-accent bg-accent' : 'border-hairline bg-surface-2'
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-2.5 w-2.5 rounded-full transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-2.5 bg-accent-ink' : 'bg-ink-3'
          }`}
        />
      </span>
    </button>
  );
}
