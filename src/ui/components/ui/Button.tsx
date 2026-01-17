import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent';
  active?: boolean;
}

export function Button({
  variant = 'primary',
  active = false,
  className = '',
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const baseClasses =
    'px-3 py-1.5 rounded text-sm font-medium transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent-blue/50';

  const variantClasses = {
    primary: active
      ? 'bg-accent-blue text-white'
      : 'bg-panel text-gray-300 hover:bg-border hover:text-gray-100',
    secondary:
      'bg-transparent text-gray-300 hover:bg-panel hover:text-gray-100 hover:border-gray-500 border border-border active:bg-border',
    accent: 'bg-accent-green text-white hover:bg-green-600 active:bg-green-700',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
