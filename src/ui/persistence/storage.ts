/**
 * Storage utilities for reading/writing persisted state to localStorage.
 * Handles validation, error recovery, and debounced saving.
 */

import { z } from 'zod';
import {
  type PersistedState,
  type PersistedSimulation,
  type PersistedUI,
  PERSISTENCE_VERSION,
  STORAGE_KEY,
} from './types.js';
import {
  PersistedStateSchema,
  PersistedSimulationSchema,
  TunableConfigSchema,
  PersistedUISchema,
} from './schema.js';
import { type TunableConfig, DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { detectUnitSystem } from '../utils/units.js';

/**
 * Result of loading persisted state.
 * Each section may be present (valid) or null (invalid/missing).
 */
export interface LoadResult {
  simulation: PersistedSimulation | null;
  tunableConfig: TunableConfig | null;
  ui: PersistedUI | null;
  /** Whether the stored version matched */
  versionValid: boolean;
  /** Errors encountered during loading */
  errors: string[];
}

/**
 * Load persisted state from localStorage.
 * Validates each section independently for graceful degradation.
 */
export function loadPersistedState(): LoadResult {
  const result: LoadResult = {
    simulation: null,
    tunableConfig: null,
    ui: null,
    versionValid: false,
    errors: [],
  };

  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return result;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      result.errors.push('Failed to parse stored JSON');
      return result;
    }

    // Check if it's an object
    if (typeof parsed !== 'object' || parsed === null) {
      result.errors.push('Stored data is not an object');
      return result;
    }

    // Check version first
    const data = parsed as Record<string, unknown>;
    if (data.version !== PERSISTENCE_VERSION) {
      result.errors.push(
        `Version mismatch: stored ${String(data.version)}, expected ${PERSISTENCE_VERSION}`
      );
      return result;
    }
    result.versionValid = true;

    // Try to validate full state first
    const fullValidation = PersistedStateSchema.safeParse(data);
    if (fullValidation.success) {
      result.simulation = fullValidation.data.simulation;
      result.tunableConfig = fullValidation.data.tunableConfig;
      result.ui = fullValidation.data.ui;
      return result;
    }

    // Full validation failed - try each section independently
    if (data.simulation !== undefined) {
      const simValidation = PersistedSimulationSchema.safeParse(data.simulation);
      if (simValidation.success) {
        result.simulation = simValidation.data;
      } else {
        result.errors.push(`Simulation section invalid: ${formatZodError(simValidation.error)}`);
      }
    }

    if (data.tunableConfig !== undefined) {
      const configValidation = TunableConfigSchema.safeParse(data.tunableConfig);
      if (configValidation.success) {
        // Merge with defaults to handle new fields
        result.tunableConfig = mergeConfigWithDefaults(configValidation.data);
      } else {
        result.errors.push(`Config section invalid: ${formatZodError(configValidation.error)}`);
      }
    }

    if (data.ui !== undefined) {
      const uiValidation = PersistedUISchema.safeParse(data.ui);
      if (uiValidation.success) {
        result.ui = uiValidation.data;
      } else {
        result.errors.push(`UI section invalid: ${formatZodError(uiValidation.error)}`);
      }
    }
  } catch (error) {
    result.errors.push(`Unexpected error: ${String(error)}`);
  }

  return result;
}

/**
 * Merge stored config with defaults to handle new fields added in code.
 */
function mergeConfigWithDefaults(stored: TunableConfig): TunableConfig {
  const result = { ...DEFAULT_CONFIG };

  for (const section of Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[]) {
    result[section] = {
      ...DEFAULT_CONFIG[section],
      ...(stored[section] ?? {}),
    };
  }

  return result;
}

/**
 * Format Zod error for logging.
 */
function formatZodError(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// Debounce state for saving
let saveTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

/**
 * Save persisted state to localStorage with debouncing.
 * @param state Complete state to save
 * @param debounceMs Debounce delay (default 500ms)
 */
export function savePersistedState(state: PersistedState, debounceMs = 500): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
  }

  saveTimeout = globalThis.setTimeout(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Storage full or unavailable
      console.warn('Failed to save state to localStorage:', error);
    }
    saveTimeout = null;
  }, debounceMs);
}

/**
 * Save persisted state immediately (bypassing debounce).
 */
export function savePersistedStateNow(state: PersistedState): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save state to localStorage:', error);
  }
}

/**
 * Clear any pending save timeout.
 */
export function cancelPendingSave(): void {
  if (saveTimeout) {
    globalThis.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

/**
 * Clear all persisted state from localStorage.
 */
export function clearPersistedState(): void {
  cancelPendingSave();
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may not be available
  }
}

/**
 * Check if ?reset query parameter is present.
 */
export function hasResetQueryParam(): boolean {
  try {
    return globalThis.location.search.includes('reset');
  } catch {
    return false;
  }
}

/**
 * Handle reset query parameter: clear storage and redirect to clean URL.
 * Returns true if reset was performed (caller should skip rendering).
 */
export function handleResetQueryParam(): boolean {
  if (!hasResetQueryParam()) {
    return false;
  }

  clearPersistedState();

  try {
    globalThis.location.href = globalThis.location.pathname;
  } catch {
    // If redirect fails, just continue with cleared state
  }

  return true;
}

/**
 * Get default UI state based on browser detection.
 */
export function getDefaultUI(): PersistedUI {
  return {
    units: detectUnitSystem(),
    debugPanelOpen: false,
  };
}

/**
 * Create a complete PersistedState from individual sections.
 */
export function createPersistedState(
  simulation: PersistedSimulation,
  tunableConfig: TunableConfig,
  ui: PersistedUI
): PersistedState {
  return {
    version: PERSISTENCE_VERSION,
    simulation,
    tunableConfig,
    ui,
  };
}
