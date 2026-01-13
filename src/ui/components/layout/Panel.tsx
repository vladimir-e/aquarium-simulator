import React from 'react';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function Panel({ title, children, className = '', action }: PanelProps): React.JSX.Element {
  return (
    <div className={`bg-panel rounded-lg border border-border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
