import React from 'react';

/**
 * Power on a device row. Accent because it is interactive and the device is
 * drawing current — never because the device is healthy.
 */
export function PowerToggle({
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
      className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        className={`relative block h-4 w-[26px] rounded-full border transition-colors motion-reduce:transition-none ${
          checked ? 'border-accent bg-accent' : 'border-hairline bg-surface-2'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-2.5 w-2.5 rounded-full transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-2.5 bg-accent-ink' : 'bg-ink-3'
          }`}
        />
      </span>
    </button>
  );
}
