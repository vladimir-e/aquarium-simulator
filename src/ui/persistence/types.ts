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
  Fish,
  AlertState,
} from '../../simulation/state.js';
import type { TunableConfig } from '../../simulation/config/index.js';

/**
 * Schema version for persisted state.
 * Increment this when the structure changes in a breaking way.
 * On version mismatch, stored data is discarded.
 *
 * v6: Fish gains `surplus` (vitality overflow store, task 40). Plant
 *     condition semantics also change (now driven by stressors +
 *     benefits, not raw nutrient sufficiency) but its persisted shape
 *     is identical, so the bump is purely the new Fish field.
 */
export const PERSISTENCE_VERSION = 6;

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
  fish: Fish[];
  alertState: AlertState;
  /** Currently selected preset ID */
  currentPreset: string;
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
