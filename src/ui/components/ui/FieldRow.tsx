import React from 'react';

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
