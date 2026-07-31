import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'aquarium-theme-mode';

interface ThemeContextValue {
  /** Current theme mode setting (system/light/dark) */
  mode: ThemeMode;
  /** The actual resolved theme (light/dark) after system preference */
  resolvedTheme: ResolvedTheme;
  /** Set the theme mode */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Get initial theme mode from localStorage.
 */
function getInitialMode(): ThemeMode {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Storage unavailable
  }
  return 'system';
}

/**
 * Get the system's preferred color scheme.
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Default to dark if matchMedia unavailable
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Derived synchronously so a toggle resolves in the same render as the mode
  // change — no chained effect, so no intermediate stale-theme paint.
  const resolvedTheme: ResolvedTheme = mode === 'system' ? systemTheme : mode;

  // Track the OS preference so `system` mode follows it live.
  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return;

    const handleChange = (): void => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return (): void => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Apply the theme class before paint so the swap never shows a stale frame.
  useLayoutEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // Persist mode to localStorage
  useEffect(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage unavailable
    }
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      setMode,
    }),
    [mode, resolvedTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access theme state and controls.
 * Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
