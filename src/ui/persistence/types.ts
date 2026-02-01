/**
 * Type definitions for persisted state.
 */

import type {
  Tank,
  Resources,
  Environment,
  Equipment,
  Plant,
  AlertState,
} from '../../simulation/state.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { UnitSystem } from '../utils/units.js';

/**
 * Persisted simulation state (without ephemeral logs).
 */
export interface PersistedSimulation {
  tick: number;
  tank: Tank;
  resources: Resources;
  environment: Environment;
  equipment: Equipment;
  plants: Plant[];
  alertState: AlertState;
}

/**
 * Persisted UI preferences.
 */
export interface PersistedUI {
  units: UnitSystem;
  debugPanelOpen: boolean;
}

/**
 * Complete persisted state structure.
 * This is the shape of data stored in localStorage.
 */
export interface PersistedState {
  /** Schema version for migration handling */
  version: number;
  /** Simulation state (without logs) */
  simulation: PersistedSimulation;
  /** Tunable configuration overrides */
  tunableConfig: TunableConfig;
  /** UI preferences */
  ui: PersistedUI;
}

/**
 * Partial persisted state for section-level loading.
 * Each section can be independently valid or invalid.
 */
export interface LoadedState {
  simulation: PersistedSimulation | null;
  tunableConfig: TunableConfig | null;
  ui: PersistedUI | null;
}

/**
 * Current schema version.
 * Increment when making breaking changes to the persisted structure.
 */
export const PERSISTENCE_SCHEMA_VERSION = 1;

/**
 * Storage key for unified persistence.
 */
export const STORAGE_KEY = 'aquarium-state';

/**
 * Legacy storage keys to migrate from.
 */
export const LEGACY_KEYS = {
  tunableConfig: 'aquarium-tunable-config',
  units: 'aquarium-units',
  debugPanel: 'aquarium-debug-panel-open',
} as const;
