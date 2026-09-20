import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { FOCUSABLE } from '../../hooks/useFocusTrap';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * Marks a region whose own clicks govern the drawer — the control that opens
 * it, the rows that swap it for another subject, the switches beside them — so
 * the outside-click close doesn't race what the click was for.
 */
export const DRAWER_TOGGLE = { 'data-drawer-toggle': '' };

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The status word beside the name. */
  meta?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The inspector: a reading, a device, an organism, a verb, the tunables. It
 * lays over the right of the stage rather than pushing it — no scrim, no trap,
 * the columns behind stay put and keep ticking, and the keyboard is free to
 * walk back out to them. Below the tablet breakpoint the same component is a
 * full-height sheet from the bottom.
 *
 * Positioned against the stage, so its host must be a positioned element.
 */
export function Drawer({ open, onClose, title, meta, children }: DrawerProps): React.JSX.Element | null {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return (): void => opener?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target || ref.current?.contains(target) || target.closest('[data-drawer-toggle]')) return;
      onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const frame = isMobile
    ? 'fixed inset-0 z-50 animate-sheet-in'
    : 'absolute inset-y-0 right-0 z-30 w-[400px] max-w-full rounded-l-sheet border-l border-hairline animate-drawer-in';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={`flex flex-col bg-surface shadow-[var(--shadow-drawer)] ${frame}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <h2 className="truncate text-[16px] font-medium">{title}</h2>
        {meta}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
