import React from 'react';
import { ChevronDown } from 'lucide-react';

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
