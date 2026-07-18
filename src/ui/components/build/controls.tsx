import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CONTROL_FOCUS } from '../run/elements';

/** A labelled control row: name on the left, control on the right. */
export function FieldRow({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[13px] text-ink-2">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

interface StepBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  side: 'l' | 'r';
}

function StepBtn({ side, className = '', children, ...props }: StepBtnProps): React.JSX.Element {
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

/** Bare `− +` pair (no value): the count lives in the row label beside it. */
export function Adjust({
  onDecrement,
  onIncrement,
  decDisabled = false,
  incDisabled = false,
  ariaLabel,
}: {
  onDecrement: () => void;
  onIncrement: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-control border border-hairline bg-surface"
    >
      <StepBtn side="l" aria-label={`Remove ${ariaLabel}`} disabled={decDisabled} onClick={onDecrement}>
        −
      </StepBtn>
      <StepBtn side="r" aria-label={`Add ${ariaLabel}`} disabled={incDisabled} onClick={onIncrement}>
        +
      </StepBtn>
    </div>
  );
}

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

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Native select re-skinned to tokens (matches the header/preset select). */
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`w-full appearance-none rounded-control border border-hairline bg-surface py-1.5 pl-3 pr-8 text-[13px] font-medium text-ink transition-colors hover:border-hairline-2 ${CONTROL_FOCUS}`}
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

/** A control that only lands with a feature that doesn't exist yet — visibly inert. */
export function PlaceholderButton({
  label,
  title,
}: {
  label: React.ReactNode;
  title: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title={title}
      className="inline-flex cursor-not-allowed items-center gap-1 rounded-control px-2.5 py-1.5 text-[13px] font-medium text-ink-3 opacity-60"
    >
      {label}
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}
