import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div className="relative w-full max-w-sm rounded-card border border-hairline bg-surface-2 p-4 shadow-[0_6px_20px_rgba(40,46,45,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        <h2 className="mb-2 text-[16px] font-semibold text-ink">{title}</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-2">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-control bg-accent px-3 py-1.5 text-[13px] font-medium text-surface transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
