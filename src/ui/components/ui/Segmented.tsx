import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  /** The tank cannot take this one — a trim rung with nothing above it. */
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Stretch to the container width, splitting it evenly between options. */
  fill?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fill = false,
  className = '',
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`items-center gap-0.5 rounded-control border border-hairline bg-surface p-0.5 ${fill ? 'flex w-full' : 'inline-flex'} ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-badge px-2.5 py-1 text-sm font-medium leading-none transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              fill ? 'flex-1' : ''
            } ${active ? 'bg-accent-tint text-accent' : 'text-ink-2 hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
