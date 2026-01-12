import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children?: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div
      className={`bg-bg-panel border border-border-subtle rounded-lg overflow-hidden ${className}`}
    >
      <div className="px-3 py-2 border-b border-border-subtle">
        <h2 className="text-sm font-medium text-text-primary">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
