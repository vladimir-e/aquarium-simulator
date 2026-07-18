import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CONTROL_FOCUS } from './focus';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Native select re-skinned to tokens. `className` styles the wrapper (layout),
 *  `selectClassName` adds non-conflicting utilities to the control itself. */
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
  selectClassName = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
  selectClassName?: string;
}): React.JSX.Element {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`w-full appearance-none rounded-control border border-hairline bg-surface py-1.5 pl-3 pr-8 text-[13px] font-medium text-ink transition-colors hover:border-hairline-2 ${CONTROL_FOCUS} ${selectClassName}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}
