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
 * Schema version for stored config.
 * Increment this when TunableConfig structure changes.
 * When version mismatches, stored config is discarded to prevent runtime errors.
 */
const CONFIG_SCHEMA_VERSION = 1;

interface StoredConfig {
  version: number;
  config: TunableConfig;
}

/**
 * Validate that a value is a plain object (not null, array, or primitive).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Load config from localStorage.
 * Dynamically merges stored values with defaults to handle schema evolution.
 */
function loadConfig(): TunableConfig | null {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (!isPlainObject(parsed)) {
        return null;
      }

      // Check for versioned format
      if ('version' in parsed && 'config' in parsed) {
        const { version, config } = parsed as StoredConfig;
        // Version mismatch - discard stored config
        if (version !== CONFIG_SCHEMA_VERSION) {
          globalThis.localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        if (!isPlainObject(config)) {
          return null;
        }
        return mergeWithDefaults(config);
      }

      // Legacy format (no version) - migrate to new format
      return mergeWithDefaults(parsed);
    }
  } catch {
    // Invalid stored data
  }
  return null;
}

/**
 * Merge stored config with defaults, dynamically handling all sections.
 * This ensures new sections are included even if not in stored data.
 */
function mergeWithDefaults(stored: Record<string, unknown>): TunableConfig {
  const result = {} as Record<string, unknown>;

  // Iterate over DEFAULT_CONFIG keys to ensure all sections are present
  for (const section of Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[]) {
    const defaultSection = DEFAULT_CONFIG[section];
    const storedSection = stored[section];

    result[section] = {
      ...defaultSection,
      ...(isPlainObject(storedSection) ? storedSection : {}),
    };
  }

  return result as TunableConfig;
}

/**
 * Save config to localStorage with debouncing.
 * Uses versioned format for safe schema evolution.
 */
let saveTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

function saveConfig(config: TunableConfig): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
  }
  saveTimeout = globalThis.setTimeout(() => {
    try {
      const stored: StoredConfig = {
        version: CONFIG_SCHEMA_VERSION,
        config,
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage full or unavailable
    }
    saveTimeout = null;
  }, 500);
}

/**
 * Clear any pending save timeout.
 */
function clearSaveTimeout(): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
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

  // Cleanup pending save timeout on unmount
  useEffect(() => {
    return (): void => {
      clearSaveTimeout();
    };
  }, []);

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
