import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { PersistedSimulation, PersistedUI, LoadedState } from './types.js';
import { PERSISTENCE_SCHEMA_VERSION } from './types.js';
import {
  loadPersistedState,
  savePersistedState,
  clearSaveTimeout,
  getDefaultUI,
  extractPersistedSimulation,
} from './storage.js';
import { type TunableConfig, cloneConfig, DEFAULT_CONFIG } from '../../simulation/config/index.js';
import type { SimulationState } from '../../simulation/state.js';

interface PersistenceContextValue {
  /** Loaded simulation state (null if not persisted or invalid) */
  loadedSimulation: PersistedSimulation | null;
  /** Loaded tunable config (falls back to defaults) */
  loadedConfig: TunableConfig;
  /** Loaded UI preferences (falls back to defaults) */
  loadedUI: PersistedUI;
  /** Save current simulation state */
  saveSimulation: (state: SimulationState) => void;
  /** Save current tunable config */
  saveConfig: (config: TunableConfig) => void;
  /** Save current UI preferences */
  saveUI: (ui: PersistedUI) => void;
  /** Clear persisted simulation (keeps config and UI) */
  clearSimulation: () => void;
  /** Mark that simulation has been loaded (prevents re-loading) */
  markSimulationLoaded: () => void;
  /** Whether simulation has been loaded into state */
  simulationLoaded: boolean;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

interface PersistenceProviderProps {
  children: ReactNode;
}

export function PersistenceProvider({ children }: PersistenceProviderProps): React.JSX.Element {
  // Load persisted state once on mount
  const [loaded, setLoaded] = useState<LoadedState>(() => loadPersistedState());
  const [simulationLoaded, setSimulationLoaded] = useState(false);

  // Track current state for saving
  const currentSimulationRef = useRef<PersistedSimulation | null>(loaded.simulation);
  const currentConfigRef = useRef<TunableConfig>(
    loaded.tunableConfig ?? cloneConfig(DEFAULT_CONFIG)
  );
  const currentUIRef = useRef<PersistedUI>(loaded.ui ?? getDefaultUI());

  // Cleanup save timeout on unmount
  useEffect(() => {
    return (): void => {
      clearSaveTimeout();
    };
  }, []);

  // Save state when refs change
  const scheduleSave = useCallback(() => {
    if (currentSimulationRef.current) {
      savePersistedState({
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: currentSimulationRef.current,
        tunableConfig: currentConfigRef.current,
        ui: currentUIRef.current,
      });
    } else {
      // Save config and UI even without simulation
      savePersistedState({
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: {
          tick: 0,
          tank: { capacity: 40, hardscapeSlots: 4 },
          resources: {
            water: 40,
            temperature: 25,
            surface: 0,
            flow: 0,
            light: 0,
            aeration: false,
            food: 0,
            waste: 0,
            algae: 0,
            ammonia: 0,
            nitrite: 0,
            nitrate: 0,
            oxygen: 8,
            co2: 4,
            ph: 6.5,
            aob: 0,
            nob: 0,
          },
          environment: {
            roomTemperature: 22,
            tapWaterTemperature: 20,
            tapWaterPH: 6.5,
          },
          equipment: {
            heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
            lid: { type: 'none' },
            ato: { enabled: false },
            filter: { enabled: true, type: 'hob' },
            powerhead: { enabled: false, flowRateGPH: 200 },
            substrate: { type: 'none' },
            hardscape: { items: [] },
            light: { enabled: false, wattage: 10, schedule: { startHour: 8, duration: 8 } },
            co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 7, duration: 10 } },
            airPump: { enabled: false },
          },
          plants: [],
          alertState: {
            waterLevelCritical: false,
            highAlgae: false,
            highAmmonia: false,
            highNitrite: false,
            highNitrate: false,
            lowOxygen: false,
            highCo2: false,
          },
        },
        tunableConfig: currentConfigRef.current,
        ui: currentUIRef.current,
      });
    }
  }, []);

  const saveSimulation = useCallback(
    (state: SimulationState) => {
      currentSimulationRef.current = extractPersistedSimulation(state);
      scheduleSave();
    },
    [scheduleSave]
  );

  const saveConfig = useCallback(
    (config: TunableConfig) => {
      currentConfigRef.current = config;
      scheduleSave();
    },
    [scheduleSave]
  );

  const saveUI = useCallback(
    (ui: PersistedUI) => {
      currentUIRef.current = ui;
      scheduleSave();
    },
    [scheduleSave]
  );

  const clearSimulation = useCallback(() => {
    currentSimulationRef.current = null;
    setLoaded((prev) => ({ ...prev, simulation: null }));
    setSimulationLoaded(false);
    scheduleSave();
  }, [scheduleSave]);

  const markSimulationLoaded = useCallback(() => {
    setSimulationLoaded(true);
  }, []);

  const value: PersistenceContextValue = {
    loadedSimulation: loaded.simulation,
    loadedConfig: loaded.tunableConfig ?? cloneConfig(DEFAULT_CONFIG),
    loadedUI: loaded.ui ?? getDefaultUI(),
    saveSimulation,
    saveConfig,
    saveUI,
    clearSimulation,
    markSimulationLoaded,
    simulationLoaded,
  };

  return (
    <PersistenceContext.Provider value={value}>{children}</PersistenceContext.Provider>
  );
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
