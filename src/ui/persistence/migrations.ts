/**
 * Migration functions for persisted state schema evolution.
 */

import type { PersistedState, PersistedUI } from './types.js';
import { PERSISTENCE_SCHEMA_VERSION, LEGACY_KEYS } from './types.js';
import { validateTunableConfig } from './schema.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { detectUnitSystem, type UnitSystem } from '../utils/units.js';

/**
 * Migrate persisted state from an older version to the current version.
 * Returns null if migration is not possible.
 */
export function migrateState(data: unknown, fromVersion: number): PersistedState | null {
  // Currently at version 1, no prior versions to migrate from
  // Future migrations would be added here as version increases
  if (fromVersion === PERSISTENCE_SCHEMA_VERSION) {
    return data as PersistedState;
  }

  // Unknown version - cannot migrate
  return null;
}

/**
 * Check for and migrate from legacy storage keys.
 * Returns partial state from legacy keys, or null if none found.
 */
export function migrateLegacyKeys(): {
  tunableConfig: TunableConfig | null;
  ui: PersistedUI | null;
} {
  const result: {
    tunableConfig: TunableConfig | null;
    ui: PersistedUI | null;
  } = {
    tunableConfig: null,
    ui: null,
  };

  try {
    // Migrate tunable config
    const legacyConfig = globalThis.localStorage.getItem(LEGACY_KEYS.tunableConfig);
    if (legacyConfig) {
      const parsed = JSON.parse(legacyConfig);
      // Legacy format: { version: number, config: TunableConfig }
      if (parsed && typeof parsed === 'object' && 'config' in parsed) {
        const validated = validateTunableConfig(parsed.config);
        if (validated) {
          result.tunableConfig = mergeConfigWithDefaults(validated);
        }
      }
    }

    // Migrate units preference
    const legacyUnits = globalThis.localStorage.getItem(LEGACY_KEYS.units);
    const legacyDebugPanel = globalThis.localStorage.getItem(LEGACY_KEYS.debugPanel);

    if (legacyUnits || legacyDebugPanel) {
      let units: UnitSystem = detectUnitSystem();
      if (legacyUnits === 'metric' || legacyUnits === 'imperial') {
        units = legacyUnits;
      }

      result.ui = {
        units,
        debugPanelOpen: legacyDebugPanel === 'true',
      };
    }
  } catch {
    // Ignore errors during legacy migration
  }

  return result;
}

/**
 * Remove legacy storage keys after successful migration.
 */
export function removeLegacyKeys(): void {
  try {
    globalThis.localStorage.removeItem(LEGACY_KEYS.tunableConfig);
    globalThis.localStorage.removeItem(LEGACY_KEYS.units);
    globalThis.localStorage.removeItem(LEGACY_KEYS.debugPanel);
  } catch {
    // Ignore errors
  }
}

/**
 * Check if any legacy keys exist.
 */
export function hasLegacyKeys(): boolean {
  try {
    return (
      globalThis.localStorage.getItem(LEGACY_KEYS.tunableConfig) !== null ||
      globalThis.localStorage.getItem(LEGACY_KEYS.units) !== null ||
      globalThis.localStorage.getItem(LEGACY_KEYS.debugPanel) !== null
    );
  } catch {
    return false;
  }
}

/**
 * Merge validated config with defaults to handle schema evolution.
 * Only copies values for keys that exist in defaults with valid number types.
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
 * Type guard for plain objects.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
