import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';
import { CONTROL_FOCUS } from './focus';

/** The cycle the one button walks, so OS-follow is always one press away. */
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

const ICON: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const NAME: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

interface ThemeCycle {
  Icon: typeof Sun;
  /** The mode it is in. */
  name: string;
  /** The mode it is in and the one a press goes to. */
  label: string;
  cycle: () => void;
}

/** One press walks the modes, wherever the control that presses it sits. */
export function useThemeCycle(): ThemeCycle {
  const { mode, setMode } = useTheme();
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return {
    Icon: ICON[mode],
    name: NAME[mode],
    label: `${NAME[mode]} theme — switch to ${NAME[next].toLowerCase()}`,
    cycle: () => setMode(next),
  };
}

export function ThemeToggle({ className = '' }: { className?: string }): React.JSX.Element {
  const { Icon, label, cycle } = useThemeCycle();

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-control border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink ${CONTROL_FOCUS} ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
