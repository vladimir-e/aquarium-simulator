import React from 'react';

interface ModePlaceholderProps {
  title: string;
  note: string;
}

export function ModePlaceholder({ title, note }: ModePlaceholderProps): React.JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-2xl font-semibold text-ink">{title}</div>
      <p className="max-w-sm text-[15px] leading-relaxed text-ink-2">{note}</p>
    </div>
  );
}
