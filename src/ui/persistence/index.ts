/**
 * Persistence module - centralized state persistence for the application.
 */

export { type PersistedState, type PersistedSimulation, type PersistedUI, PERSISTENCE_VERSION, STORAGE_KEY } from './types.js';
export { PersistedStateSchema, PersistedSimulationSchema, TunableConfigSchema, PersistedUISchema } from './schema.js';
export {
  loadPersistedState,
  savePersistedState,
  flushPendingSave,
  cancelPendingSave,
  clearPersistedState,
  hasResetQueryParam,
  handleResetQueryParam,
  getDefaultUI,
  createPersistedState,
  type LoadResult,
} from './storage.js';
export { PersistenceProvider, usePersistence } from './PersistenceProvider.js';
