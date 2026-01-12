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
}: ButtonProps) {
  const baseClasses =
    'px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: active
      ? 'bg-accent-blue text-white'
      : 'bg-panel text-gray-300 hover:bg-border',
    secondary: 'bg-transparent text-gray-300 hover:bg-panel border border-border',
    accent: 'bg-accent-green text-white hover:bg-green-600',
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
