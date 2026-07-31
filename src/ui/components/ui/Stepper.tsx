import React from 'react';
import { CONTROL_FOCUS } from './focus';

interface StepBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  side: 'l' | 'r';
}

export function StepBtn({ side, className = '', children, ...props }: StepBtnProps): React.JSX.Element {
  const radius = side === 'l' ? 'rounded-l-[7px]' : 'rounded-r-[7px]';
  return (
    <button
      type="button"
      className={`flex h-8 w-8 items-center justify-center text-[15px] leading-none text-ink-2 transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:text-ink-3 ${radius} ${CONTROL_FOCUS} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** `− value +` stepper: one hairline container, mono tabular value, muted at bounds. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  display,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formatted value (e.g. "72°F", "8:00"); defaults to the raw number. */
  display?: string;
  ariaLabel: string;
}): React.JSX.Element {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-control border border-hairline bg-surface"
    >
      <StepBtn side="l" aria-label="decrease" disabled={atMin} onClick={() => onChange(value - step)}>
        −
      </StepBtn>
      <span className="min-w-[3.25rem] px-1 text-center font-mono text-[14px] tabular-nums text-ink">
        {display ?? value}
      </span>
      <StepBtn side="r" aria-label="increase" disabled={atMax} onClick={() => onChange(value + step)}>
        +
      </StepBtn>
    </div>
  );
}
