import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';
import { Button } from './Button';

interface ThemeOption {
  mode: ThemeMode;
  icon: React.ReactNode;
  label: string;
}

const themeOptions: ThemeOption[] = [
  { mode: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
  { mode: 'light', icon: <Sun className="w-3.5 h-3.5" />, label: 'Day' },
  { mode: 'dark', icon: <Moon className="w-3.5 h-3.5" />, label: 'Night' },
];

export function ThemeSwitcher(): React.JSX.Element {
  const { mode, setMode } = useTheme();

  return (
    <div className="flex items-center gap-1">
      {themeOptions.map((option) => (
        <Button
          key={option.mode}
          onClick={() => setMode(option.mode)}
          active={mode === option.mode}
          variant="primary"
          className="text-xs px-2 py-1.5 flex items-center gap-1"
          title={`Theme: ${option.label}`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </Button>
      ))}
    </div>
  );
}
