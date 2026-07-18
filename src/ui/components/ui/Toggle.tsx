import React from 'react';
import { CONTROL_FOCUS } from './focus';

/** Pill toggle: on = ok-tint track + ok knob + "on"; off = track + ink-3 knob + "off". */
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
      className={`inline-flex items-center gap-2 rounded-control ${CONTROL_FOCUS}`}
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors motion-reduce:transition-none ${checked ? 'bg-ok-tint' : 'bg-track'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform motion-reduce:transition-none ${checked ? 'translate-x-4 bg-ok' : 'bg-ink-3'}`}
        />
      </span>
      <span className={`text-[12px] font-medium ${checked ? 'text-ok-text' : 'text-ink-3'}`}>
        {checked ? 'on' : 'off'}
      </span>
    </button>
  );
}
