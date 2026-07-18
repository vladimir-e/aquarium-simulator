import React from 'react';
import { StepBtn } from '../ui/Stepper';

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
