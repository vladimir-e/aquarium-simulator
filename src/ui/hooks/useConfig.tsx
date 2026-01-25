import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import {
  type TunableConfig,
  DEFAULT_CONFIG,
  cloneConfig,
  isModified,
  isSectionModified,
  isConfigModified,
} from '../../simulation/config/index.js';

const STORAGE_KEY = 'aquarium-tunable-config';

/**
 * Load config from localStorage.
 */
function loadConfig(): TunableConfig | null {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle added properties
      return {
        decay: { ...DEFAULT_CONFIG.decay, ...parsed.decay },
        nitrogenCycle: { ...DEFAULT_CONFIG.nitrogenCycle, ...parsed.nitrogenCycle },
        gasExchange: { ...DEFAULT_CONFIG.gasExchange, ...parsed.gasExchange },
        temperature: { ...DEFAULT_CONFIG.temperature, ...parsed.temperature },
        evaporation: { ...DEFAULT_CONFIG.evaporation, ...parsed.evaporation },
        algae: { ...DEFAULT_CONFIG.algae, ...parsed.algae },
        ph: { ...DEFAULT_CONFIG.ph, ...parsed.ph },
      };
    }
  } catch {
    // Invalid stored data
  }
  return null;
}

/**
 * Save config to localStorage with debouncing.
 */
let saveTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

function saveConfig(config: TunableConfig): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
  }
  saveTimeout = globalThis.setTimeout(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Storage full or unavailable
    }
  }, 500);
}

interface ConfigContextValue {
  /** Current tunable configuration */
  config: TunableConfig;
  /** Update a specific value in the config */
  updateConfig: <K extends keyof TunableConfig>(
    section: K,
    key: keyof TunableConfig[K],
    value: number
  ) => void;
  /** Reset all config to defaults */
  resetConfig: () => void;
  /** Reset a specific section to defaults */
  resetSection: (section: keyof TunableConfig) => void;
  /** Check if a specific value is modified from default */
  isValueModified: <K extends keyof TunableConfig>(
    section: K,
    key: keyof TunableConfig[K]
  ) => boolean;
  /** Check if a section has any modifications */
  isSectionModified: (section: keyof TunableConfig) => boolean;
  /** Check if any value is modified */
  isAnyModified: boolean;
  /** Debug panel visibility state */
  isDebugPanelOpen: boolean;
  /** Toggle debug panel visibility */
  toggleDebugPanel: () => void;
  /** Set debug panel visibility */
  setDebugPanelOpen: (open: boolean) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

/**
 * Get initial config: localStorage -> defaults.
 */
function getInitialConfig(): TunableConfig {
  const stored = loadConfig();
  return stored ?? cloneConfig(DEFAULT_CONFIG);
}

/**
 * Get initial debug panel state from localStorage.
 */
function getInitialDebugPanelState(): boolean {
  try {
    const stored = globalThis.localStorage.getItem('aquarium-debug-panel-open');
    return stored === 'true';
  } catch {
    return false;
  }
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps): React.JSX.Element {
  const [config, setConfig] = useState<TunableConfig>(getInitialConfig);
  const [isDebugPanelOpen, setDebugPanelOpenState] = useState(getInitialDebugPanelState);

  // Save config to localStorage when it changes
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Save debug panel state to localStorage
  useEffect(() => {
    try {
      globalThis.localStorage.setItem('aquarium-debug-panel-open', String(isDebugPanelOpen));
    } catch {
      // Storage unavailable
    }
  }, [isDebugPanelOpen]);

  const updateConfig = useCallback(
    <K extends keyof TunableConfig>(
      section: K,
      key: keyof TunableConfig[K],
      value: number
    ) => {
      setConfig((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value,
        },
      }));
    },
    []
  );

  const resetConfig = useCallback(() => {
    setConfig(cloneConfig(DEFAULT_CONFIG));
  }, []);

  const resetSection = useCallback((section: keyof TunableConfig) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...DEFAULT_CONFIG[section] },
    }));
  }, []);

  const toggleDebugPanel = useCallback(() => {
    setDebugPanelOpenState((prev) => !prev);
  }, []);

  const setDebugPanelOpen = useCallback((open: boolean) => {
    setDebugPanelOpenState(open);
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      updateConfig,
      resetConfig,
      resetSection,
      isValueModified: <K extends keyof TunableConfig>(
        section: K,
        key: keyof TunableConfig[K]
      ): boolean => isModified(config, section, key),
      isSectionModified: (section: keyof TunableConfig): boolean =>
        isSectionModified(config, section),
      isAnyModified: isConfigModified(config),
      isDebugPanelOpen,
      toggleDebugPanel,
      setDebugPanelOpen,
    }),
    [config, updateConfig, resetConfig, resetSection, isDebugPanelOpen, toggleDebugPanel, setDebugPanelOpen]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/**
 * Hook to access tunable configuration.
 * Must be used within a ConfigProvider.
 */
export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
