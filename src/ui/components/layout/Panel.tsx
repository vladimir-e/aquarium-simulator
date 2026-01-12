import React from 'react';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`bg-panel rounded-lg border border-border p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}
