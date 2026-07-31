import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';

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

export function ThemeToggle(): React.JSX.Element {
  const { mode, setMode } = useTheme();
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  const Icon = ICON[mode];
  const label = `${NAME[mode]} theme — switch to ${NAME[next].toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 items-center justify-center rounded-control border border-hairline text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus max-sm:after:absolute max-sm:after:inset-[-6px] max-sm:after:content-['']"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
