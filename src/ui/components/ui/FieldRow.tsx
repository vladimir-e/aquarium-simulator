import React from 'react';

/** A labelled control row: name on the left, control on the right. */
export function FieldRow({
  label,
  note,
  children,
}: {
  label: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-[13px] text-ink-2">
        {label}
        {note && <span className="block text-[11px] leading-4 text-ink-3">{note}</span>}
      </span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
