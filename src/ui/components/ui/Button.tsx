import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  active = false,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent-blue disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    default:
      'bg-bg-panel border border-border text-text-primary hover:bg-border-subtle',
    primary:
      'bg-accent-blue text-white hover:bg-accent-blue/90',
    secondary:
      'bg-accent-orange text-white hover:bg-accent-orange/90',
    ghost:
      'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-panel',
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const activeStyles = active ? 'bg-accent-orange text-white hover:bg-accent-orange/90' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${activeStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
