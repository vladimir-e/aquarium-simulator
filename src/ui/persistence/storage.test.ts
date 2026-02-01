/**
 * Unit tests for persistence storage functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadPersistedState,
  savePersistedState,
  clearPersistedState,
  getDefaultUI,
  getDefaultConfig,
  createPersistedState,
  extractPersistedSimulation,
  clearSaveTimeout,
} from './storage.js';
import { STORAGE_KEY, PERSISTENCE_SCHEMA_VERSION } from './types.js';
import type { PersistedSimulation } from './types.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

describe('storage', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearSaveTimeout();
    vi.useRealTimers();
    globalThis.localStorage.clear();
  });

  describe('loadPersistedState', () => {
    it('returns null values when globalThis.localStorage is empty', () => {
      const result = loadPersistedState();
      expect(result.simulation).toBeNull();
      expect(result.tunableConfig).toBeNull();
      expect(result.ui).toBeNull();
    });

    it('loads valid persisted state', () => {
      const validState = {
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: createValidSimulation(),
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(validState));

      const result = loadPersistedState();
      expect(result.simulation).not.toBeNull();
      expect(result.simulation?.tick).toBe(100);
      expect(result.tunableConfig).not.toBeNull();
      expect(result.ui).not.toBeNull();
      expect(result.ui?.units).toBe('metric');
    });

    it('handles corrupted simulation section gracefully', () => {
      const corruptedState = {
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: { tick: 'invalid' }, // Invalid tick type
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(corruptedState));

      const result = loadPersistedState();
      expect(result.simulation).toBeNull(); // Invalid section returns null
      expect(result.tunableConfig).not.toBeNull(); // Valid section preserved
      expect(result.ui).not.toBeNull();
    });

    it('handles version mismatch by returning null', () => {
      const oldVersionState = {
        version: 999, // Future version
        simulation: createValidSimulation(),
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(oldVersionState));

      const result = loadPersistedState();
      expect(result.simulation).toBeNull();
      expect(result.tunableConfig).toBeNull();
      expect(result.ui).toBeNull();
    });

    it('handles invalid JSON gracefully', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'not valid json {{{');

      const result = loadPersistedState();
      expect(result.simulation).toBeNull();
      expect(result.tunableConfig).toBeNull();
      expect(result.ui).toBeNull();
    });

  });

  describe('savePersistedState', () => {
    it('saves state with debounce', () => {
      const state = {
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: createValidSimulation(),
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };

      savePersistedState(state);

      // State not saved immediately
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();

      // Advance timer by 500ms
      vi.advanceTimersByTime(500);

      // Now state should be saved
      const saved = globalThis.localStorage.getItem(STORAGE_KEY);
      expect(saved).not.toBeNull();
      expect(JSON.parse(saved!).version).toBe(PERSISTENCE_SCHEMA_VERSION);
    });

  });

  describe('clearPersistedState', () => {
    it('clears all persisted state', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));

      clearPersistedState();

      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('getDefaultUI', () => {
    it('returns default UI preferences', () => {
      const defaults = getDefaultUI();
      expect(defaults.debugPanelOpen).toBe(false);
      expect(['metric', 'imperial']).toContain(defaults.units);
    });
  });

  describe('getDefaultConfig', () => {
    it('returns default tunable config', () => {
      const config = getDefaultConfig();
      expect(config.decay).toBeDefined();
      expect(config.nitrogenCycle).toBeDefined();
    });
  });

  describe('createPersistedState', () => {
    it('creates a valid persisted state structure', () => {
      const simulation = createValidSimulation();
      const config = DEFAULT_CONFIG;
      const ui = { units: 'metric' as const, debugPanelOpen: true };

      const state = createPersistedState(simulation, config, ui);

      expect(state.version).toBe(PERSISTENCE_SCHEMA_VERSION);
      expect(state.simulation).toBe(simulation);
      expect(state.tunableConfig).toBe(config);
      expect(state.ui).toBe(ui);
    });
  });

  describe('extractPersistedSimulation', () => {
    it('strips logs from simulation state', () => {
      const stateWithLogs = {
        ...createValidSimulation(),
        logs: [{ tick: 0, source: 'test', severity: 'info', message: 'test' }],
      };

      const persisted = extractPersistedSimulation(stateWithLogs);

      expect(persisted).not.toHaveProperty('logs');
      expect(persisted.tick).toBe(100);
    });
  });
});

/**
 * Helper to create a valid simulation state for testing.
 */
function createValidSimulation(): PersistedSimulation {
  return {
    tick: 100,
    tank: { capacity: 40, hardscapeSlots: 4 },
    resources: {
      water: 40,
      temperature: 25,
      surface: 500,
      flow: 100,
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
      ph: 7,
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: 22,
      tapWaterTemperature: 20,
      tapWaterPH: 7,
    },
    equipment: {
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
      lid: { type: 'none' },
      ato: { enabled: false },
      filter: { enabled: true, type: 'hob' },
      powerhead: { enabled: false, flowRateGPH: 200 },
      substrate: { type: 'gravel' },
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
  };
}
