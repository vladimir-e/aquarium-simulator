import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { controlClasses } from './elements';

export interface SplitOption {
  key: string;
  label: React.ReactNode;
  /** Right-aligned mono preview (count/ppm/ml). */
  hint?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  label: React.ReactNode;
  options: SplitOption[];
  /** When set, the label is itself an action and only the caret opens the menu. */
  onMain?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  ariaLabel?: string;
  align?: 'left' | 'right';
}

/**
 * A pick-and-act control. As a menu (no `onMain`) every option runs its action
 * on click; as a split button the label re-runs the current action and the
 * caret opens the same options. The menu opens upward — these live in footers.
 */
export function SplitButton({
  label,
  options,
  onMain,
  variant = 'secondary',
  disabled = false,
  ariaLabel,
  align = 'left',
}: SplitButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runOption = (option: SplitOption): void => {
    if (option.disabled) return;
    option.onSelect();
    setOpen(false);
  };

  const base = controlClasses(variant);

  return (
    <div ref={rootRef} className="relative inline-flex">
      {onMain ? (
        <div className={`inline-flex ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
          <button
            type="button"
            onClick={onMain}
            className={`flex items-center gap-1 rounded-l-[8px] ${base}`}
            aria-label={ariaLabel}
          >
            {label}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Choose amount"
            className={`flex items-center rounded-r-[8px] border-l border-current/20 px-1.5 ${base}`}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={`flex items-center gap-1 rounded-control ${base}`}
        >
          {label}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute bottom-full z-20 mb-1 min-w-[9rem] overflow-hidden rounded-control border border-hairline bg-surface-2 py-1 shadow-[0_6px_20px_rgba(40,46,45,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              onClick={() => runOption(option)}
              disabled={option.disabled}
              className="flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-40"
            >
              <span>{option.label}</span>
              {option.hint != null && (
                <span className="font-mono text-[12px] tabular-nums text-ink-3">{option.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
