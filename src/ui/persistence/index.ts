/**
 * Unified persistence system for aquarium simulator.
 *
 * Provides centralized state persistence with:
 * - Versioned schema for validation
 * - Section-level validation and recovery
 * - Debounced auto-save
 */

export { PersistenceProvider, usePersistence } from './PersistenceProvider.js';
export { ErrorBoundary } from './ErrorBoundary.js';

export type {
  PersistedState,
  PersistedSimulation,
  PersistedUI,
  LoadedState,
} from './types.js';

export {
  STORAGE_KEY,
  PERSISTENCE_SCHEMA_VERSION,
} from './types.js';

export {
  loadPersistedState,
  savePersistedState,
  savePersistedStateSync,
  clearPersistedState,
  clearPersistedSimulation,
  getDefaultUI,
  getDefaultConfig,
  createPersistedState,
  extractPersistedSimulation,
} from './storage.js';

export {
  validateSimulation,
  validateTunableConfig,
  validateUI,
  validatePersistedState,
} from './schema.js';
