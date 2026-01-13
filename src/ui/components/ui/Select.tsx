import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className = '', children, ...props }: SelectProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-gray-400">{label}</label>}
      <select
        className={`bg-panel border border-border rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-accent-blue ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
