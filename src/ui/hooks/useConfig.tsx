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
  withTunable,
} from '../../simulation/config/index.js';
import { usePersistence } from '../persistence/index.js';

interface ConfigContextValue {
  config: TunableConfig;
  /** Write one constant, addressed the way `config set` addresses it. */
  setTunable: (path: string, value: number) => void;
  resetSection: (section: keyof TunableConfig) => void;
  resetAll: () => void;
  tunablesOpen: boolean;
  setTunablesOpen: (open: boolean) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps): React.JSX.Element {
  const { initialTunableConfig, initialUI, onTunableConfigChange, onUIChange } = usePersistence();

  const [config, setConfig] = useState<TunableConfig>(initialTunableConfig);
  const [tunablesOpen, setTunablesOpen] = useState(initialUI.tunablesOpen);

  useEffect(() => {
    onTunableConfigChange(config);
  }, [config, onTunableConfigChange]);

  useEffect(() => {
    onUIChange({ tunablesOpen });
  }, [tunablesOpen, onUIChange]);

  const setTunable = useCallback((path: string, value: number) => {
    setConfig((prev) => withTunable(prev, path, value));
  }, []);

  const resetAll = useCallback(() => {
    setConfig(cloneConfig(DEFAULT_CONFIG));
  }, []);

  const resetSection = useCallback((section: keyof TunableConfig) => {
    setConfig((prev) => ({ ...prev, [section]: cloneConfig(DEFAULT_CONFIG)[section] }));
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({ config, setTunable, resetSection, resetAll, tunablesOpen, setTunablesOpen }),
    [config, setTunable, resetSection, resetAll, tunablesOpen]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
