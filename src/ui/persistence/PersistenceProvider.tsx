/**
 * PersistenceProvider - Centralized state persistence management.
 *
 * Provides initial state to child providers and handles auto-saving
 * when any section changes.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type PersistedState,
  type PersistedSimulation,
  type PersistedUI,
  PERSISTENCE_VERSION,
} from './types.js';
import { type TunableConfig, DEFAULT_CONFIG, cloneConfig } from '../../simulation/config/index.js';
import {
  loadPersistedState,
  savePersistedState,
  cancelPendingSave,
  flushPendingSave,
  getDefaultUI,
} from './storage.js';

/**
 * Context value provided by PersistenceProvider.
 */
interface PersistenceContextValue {
  /** Initial simulation state (null if not persisted or invalid) */
  initialSimulation: PersistedSimulation | null;
  /** Initial tunable config (defaults if not persisted or invalid) */
  initialTunableConfig: TunableConfig;
  /** Initial UI state (browser-detected defaults if not persisted) */
  initialUI: PersistedUI;
  /** Notify that simulation state has changed */
  onSimulationChange: (simulation: PersistedSimulation) => void;
  /** Notify that tunable config has changed */
  onTunableConfigChange: (config: TunableConfig) => void;
  /** Notify that UI state has changed */
  onUIChange: (ui: Partial<PersistedUI>) => void;
  /** Clear all persisted state and reset to defaults */
  clearAll: () => void;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

interface PersistenceProviderProps {
  children: ReactNode;
}

/**
 * Load initial state from localStorage with fallbacks.
 */
function loadInitialState(): {
  simulation: PersistedSimulation | null;
  tunableConfig: TunableConfig;
  ui: PersistedUI;
} {
  const loadResult = loadPersistedState();

  // Log any errors for debugging
  if (loadResult.errors.length > 0) {
    console.warn('Persistence loading errors:', loadResult.errors);
  }

  return {
    simulation: loadResult.simulation,
    tunableConfig: loadResult.tunableConfig ?? cloneConfig(DEFAULT_CONFIG),
    ui: loadResult.ui ?? getDefaultUI(),
  };
}

export function PersistenceProvider({ children }: PersistenceProviderProps): React.JSX.Element {
  // Load initial state once on mount
  const [initialState] = useState(loadInitialState);

  // Current state refs for building save payload
  const simulationRef = useRef<PersistedSimulation | null>(initialState.simulation);
  const tunableConfigRef = useRef<TunableConfig>(initialState.tunableConfig);
  const uiRef = useRef<PersistedUI>(initialState.ui);

  // Track if we have all sections for saving
  const hasSimulationRef = useRef<boolean>(initialState.simulation !== null);

  /**
   * Save current state to localStorage.
   */
  const save = useCallback(() => {
    // Only save if we have simulation state
    if (!hasSimulationRef.current || !simulationRef.current) {
      return;
    }

    const state: PersistedState = {
      version: PERSISTENCE_VERSION,
      simulation: simulationRef.current,
      tunableConfig: tunableConfigRef.current,
      ui: uiRef.current,
    };

    savePersistedState(state);
  }, []);

  /**
   * Handle simulation state changes.
   */
  const onSimulationChange = useCallback(
    (simulation: PersistedSimulation) => {
      simulationRef.current = simulation;
      hasSimulationRef.current = true;
      save();
    },
    [save]
  );

  /**
   * Handle tunable config changes.
   */
  const onTunableConfigChange = useCallback(
    (config: TunableConfig) => {
      tunableConfigRef.current = config;
      save();
    },
    [save]
  );

  /**
   * Handle UI state changes (partial updates supported).
   */
  const onUIChange = useCallback(
    (ui: Partial<PersistedUI>) => {
      uiRef.current = { ...uiRef.current, ...ui };
      save();
    },
    [save]
  );

  /**
   * Clear all persisted state and reset to defaults.
   */
  const clearAll = useCallback(() => {
    cancelPendingSave();
    try {
      globalThis.localStorage.removeItem('aquarium-state');
    } catch {
      // Storage may not be available
    }
    // Reset refs to defaults
    simulationRef.current = null;
    hasSimulationRef.current = false;
    tunableConfigRef.current = cloneConfig(DEFAULT_CONFIG);
    uiRef.current = getDefaultUI();
  }, []);

  // Flush pending save on page unload and unmount
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      flushPendingSave();
    };

    globalThis.addEventListener('beforeunload', handleBeforeUnload);

    return (): void => {
      globalThis.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingSave();
    };
  }, []);

  const value = useMemo<PersistenceContextValue>(
    () => ({
      initialSimulation: initialState.simulation,
      initialTunableConfig: initialState.tunableConfig,
      initialUI: initialState.ui,
      onSimulationChange,
      onTunableConfigChange,
      onUIChange,
      clearAll,
    }),
    [
      initialState.simulation,
      initialState.tunableConfig,
      initialState.ui,
      onSimulationChange,
      onTunableConfigChange,
      onUIChange,
      clearAll,
    ]
  );

  return <PersistenceContext.Provider value={value}>{children}</PersistenceContext.Provider>;
}

/**
 * Hook to access persistence context.
 * Must be used within a PersistenceProvider.
 */
export function usePersistence(): PersistenceContextValue {
  const context = useContext(PersistenceContext);
  if (!context) {
    throw new Error('usePersistence must be used within a PersistenceProvider');
  }
  return context;
}
