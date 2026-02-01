/**
 * Types for the persistence system.
 * Defines the structure of data saved to localStorage.
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

/**
 * Schema version for persisted state.
 * Increment this when the structure changes in a breaking way.
 * On version mismatch, stored data is discarded.
 */
export const PERSISTENCE_VERSION = 1;

/**
 * Storage key for the unified persisted state.
 */
export const STORAGE_KEY = 'aquarium-state';

/**
 * Simulation state subset that gets persisted.
 * Logs are NOT persisted - they start fresh each session.
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
 * UI preferences that get persisted.
 */
export interface PersistedUI {
  units: 'metric' | 'imperial';
  debugPanelOpen: boolean;
}

/**
 * Complete persisted state structure.
 */
export interface PersistedState {
  version: number;
  simulation: PersistedSimulation;
  tunableConfig: TunableConfig;
  ui: PersistedUI;
}
