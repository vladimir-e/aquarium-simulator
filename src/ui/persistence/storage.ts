/**
 * Storage utilities for reading and writing persisted state.
 */

import type { PersistedState, PersistedSimulation, PersistedUI, LoadedState } from './types.js';
import { STORAGE_KEY, PERSISTENCE_SCHEMA_VERSION } from './types.js';
import {
  validateSimulation,
  validateTunableConfig,
  validateUI,
  isCurrentVersion,
} from './schema.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { detectUnitSystem } from '../utils/units.js';

/**
 * Type guard for plain objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Load persisted state from localStorage.
 * Validates each section and returns null for invalid sections.
 */
export function loadPersistedState(): LoadedState {
  const result: LoadedState = {
    simulation: null,
    tunableConfig: null,
    ui: null,
  };

  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return result;
    }

    const parsed: unknown = JSON.parse(stored);
    if (!isPlainObject(parsed)) {
      return result;
    }

    // Check version - discard if not current
    const version = typeof parsed.version === 'number' ? parsed.version : 0;
    if (!isCurrentVersion(version)) {
      // eslint-disable-next-line no-console
      console.warn(`[Persistence] Version mismatch (${version}), discarding stored state`);
      return result;
    }

    const data = parsed as PersistedState;

    // Validate each section independently
    const simulation = validateSimulation(data.simulation);
    if (simulation) {
      result.simulation = simulation as PersistedSimulation;
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Persistence] Invalid simulation state, using defaults');
    }

    const tunableConfig = validateTunableConfig(data.tunableConfig);
    if (tunableConfig) {
      result.tunableConfig = mergeConfigWithDefaults(tunableConfig as Record<string, Record<string, number>>);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Persistence] Invalid tunable config, using defaults');
    }

    const ui = validateUI(data.ui);
    if (ui) {
      result.ui = ui as PersistedUI;
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Persistence] Invalid UI preferences, using defaults');
    }

  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Persistence] Failed to load persisted state:', error);
  }

  return result;
}

/**
 * Save persisted state to localStorage with debouncing.
 */
let saveTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

export function savePersistedState(state: PersistedState): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
  }

  saveTimeout = globalThis.setTimeout(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Persistence] Failed to save state:', error);
    }
    saveTimeout = null;
  }, 500);
}

/**
 * Save persisted state immediately (synchronous).
 * Used for critical saves like before page unload.
 */
export function savePersistedStateSync(state: PersistedState): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Persistence] Failed to save state:', error);
  }
}

/**
 * Clear all persisted state.
 */
export function clearPersistedState(): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Persistence] Failed to clear state:', error);
  }
}

/**
 * Clear only the simulation portion of persisted state.
 * Preserves tunable config and UI preferences.
 */
export function clearPersistedSimulation(): void {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const parsed: unknown = JSON.parse(stored);
    if (!isPlainObject(parsed)) return;

    // Remove simulation key and save back
    const copy = { ...parsed };
    delete (copy as Record<string, unknown>).simulation;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Persistence] Failed to clear simulation state:', error);
  }
}

/**
 * Get default UI preferences.
 */
export function getDefaultUI(): PersistedUI {
  return {
    units: detectUnitSystem(),
    debugPanelOpen: false,
  };
}

/**
 * Get default tunable config.
 */
export function getDefaultConfig(): TunableConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Create a complete persisted state object.
 */
export function createPersistedState(
  simulation: PersistedSimulation,
  tunableConfig: TunableConfig,
  ui: PersistedUI
): PersistedState {
  return {
    version: PERSISTENCE_SCHEMA_VERSION,
    simulation,
    tunableConfig,
    ui,
  };
}

/**
 * Extract persisted simulation from full simulation state.
 * Strips out ephemeral logs.
 */
export function extractPersistedSimulation(
  state: PersistedSimulation & { logs?: unknown }
): PersistedSimulation {
  const copy = { ...state };
  delete (copy as Record<string, unknown>).logs;
  return copy;
}

/**
 * Merge validated config with defaults to handle schema evolution.
 */
function mergeConfigWithDefaults(stored: Record<string, Record<string, number>>): TunableConfig {
  const result = {} as Record<string, Record<string, number>>;

  for (const section of Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[]) {
    const defaultSection = DEFAULT_CONFIG[section] as Record<string, number>;
    const storedSection = stored[section];
    const mergedSection = { ...defaultSection };

    if (storedSection && typeof storedSection === 'object') {
      for (const key of Object.keys(defaultSection)) {
        const storedValue = storedSection[key];
        if (typeof storedValue === 'number' && Number.isFinite(storedValue)) {
          mergedSection[key] = storedValue;
        }
      }
    }

    result[section] = mergedSection;
  }

  return result as TunableConfig;
}

/**
 * Clear pending save timeout (for cleanup).
 */
export function clearSaveTimeout(): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}
