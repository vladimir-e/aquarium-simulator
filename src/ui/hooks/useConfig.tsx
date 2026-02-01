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
import { usePersistence } from '../persistence/index.js';

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

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps): React.JSX.Element {
  const { loadedConfig, loadedUI, saveConfig: persistConfig, saveUI: persistUI } = usePersistence();

  // Initialize from persistence
  const [config, setConfig] = useState<TunableConfig>(() => loadedConfig);
  const [isDebugPanelOpen, setDebugPanelOpenState] = useState(() => loadedUI.debugPanelOpen);

  // Save config to persistence when it changes
  useEffect(() => {
    persistConfig(config);
  }, [config, persistConfig]);

  // Save debug panel state to persistence
  useEffect(() => {
    persistUI({ ...loadedUI, debugPanelOpen: isDebugPanelOpen });
  }, [isDebugPanelOpen, persistUI, loadedUI]);

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
