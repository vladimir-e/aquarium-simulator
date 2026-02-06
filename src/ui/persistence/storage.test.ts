/* eslint-disable no-undef */
// Browser globals (localStorage, navigator) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadPersistedState,
  savePersistedState,
  flushPendingSave,
  clearPersistedState,
  cancelPendingSave,
  hasResetQueryParam,
  getDefaultUI,
  createPersistedState,
} from './storage.js';
import { PERSISTENCE_VERSION, STORAGE_KEY, type PersistedSimulation } from './types.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

// Mock location
const mockLocation = {
  search: '',
  pathname: '/',
  href: 'http://localhost/',
};

describe('loadPersistedState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns empty result when no stored data', () => {
    const result = loadPersistedState();
    expect(result.simulation).toBeNull();
    expect(result.tunableConfig).toBeNull();
    expect(result.ui).toBeNull();
    expect(result.versionValid).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{');
    const result = loadPersistedState();
    expect(result.simulation).toBeNull();
    expect(result.errors).toContain('Failed to parse stored JSON');
  });

  it('returns error for non-object data', () => {
    localStorage.setItem(STORAGE_KEY, '"string value"');
    const result = loadPersistedState();
    expect(result.simulation).toBeNull();
    expect(result.errors).toContain('Stored data is not an object');
  });

  it('returns error for version mismatch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999 }));
    const result = loadPersistedState();
    expect(result.simulation).toBeNull();
    expect(result.versionValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Version mismatch'))).toBe(true);
  });

  it('loads valid complete state', () => {
    const validSimulation = createValidSimulation();
    const validState = {
      version: PERSISTENCE_VERSION,
      simulation: validSimulation,
      tunableConfig: DEFAULT_CONFIG,
      ui: { units: 'metric', debugPanelOpen: false },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validState));

    const result = loadPersistedState();
    expect(result.versionValid).toBe(true);
    expect(result.simulation).not.toBeNull();
    expect(result.tunableConfig).not.toBeNull();
    expect(result.ui).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('gracefully handles invalid simulation', () => {
    const state = {
      version: PERSISTENCE_VERSION,
      simulation: { invalid: 'data' },
      tunableConfig: DEFAULT_CONFIG,
      ui: { units: 'imperial', debugPanelOpen: true },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const result = loadPersistedState();
    expect(result.versionValid).toBe(true);
    // Simulation should fail validation
    expect(result.simulation).toBeNull();
    // Should have errors
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('gracefully handles invalid UI', () => {
    const validSimulation = createValidSimulation();
    const state = {
      version: PERSISTENCE_VERSION,
      simulation: validSimulation,
      tunableConfig: DEFAULT_CONFIG,
      ui: { invalid: 'data' },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const result = loadPersistedState();
    expect(result.versionValid).toBe(true);
    // UI should be null since it's invalid
    expect(result.ui).toBeNull();
    // Should have errors
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('savePersistedState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    localStorage.clear();
    cancelPendingSave();
    vi.useRealTimers();
  });

  it('saves state after debounce delay', () => {
    const state = createValidPersistedState();
    savePersistedState(state, 100);

    // Should not be saved yet
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Advance timer
    vi.advanceTimersByTime(100);

    // Should be saved now
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!)).toEqual(state);
  });

  it('debounces multiple rapid saves', () => {
    const state1 = createValidPersistedState();
    const state2 = { ...state1, ui: { ...state1.ui, debugPanelOpen: true } };

    savePersistedState(state1, 100);
    vi.advanceTimersByTime(50);
    savePersistedState(state2, 100);
    vi.advanceTimersByTime(100);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    // Should only save the last state
    expect(saved.ui.debugPanelOpen).toBe(true);
  });
});

describe('flushPendingSave', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('flushes pending save immediately', () => {
    vi.useFakeTimers();
    const state = createValidPersistedState();
    savePersistedState(state, 2000);

    // Nothing saved yet
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Flush immediately
    flushPendingSave();

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toEqual(state);

    vi.useRealTimers();
  });

  it('does nothing if no pending save', () => {
    flushPendingSave();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('cancels pending debounced save after flush', () => {
    vi.useFakeTimers();
    const state1 = createValidPersistedState();
    const state2 = { ...state1, ui: { ...state1.ui, debugPanelOpen: true } };

    savePersistedState(state1, 2000);
    flushPendingSave();
    savePersistedState(state2, 2000);

    // Advance past debounce time for first save
    vi.advanceTimersByTime(2100);

    // Should have the second state
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.ui.debugPanelOpen).toBe(true);

    vi.useRealTimers();
  });
});

describe('clearPersistedState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('removes stored state', () => {
    const state = createValidPersistedState();
    savePersistedState(state, 2000);
    flushPendingSave(); // Flush to actually save
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearPersistedState();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('cancels pending saves', () => {
    vi.useFakeTimers();
    const state = createValidPersistedState();
    savePersistedState(state, 500);
    clearPersistedState();
    vi.advanceTimersByTime(600);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.useRealTimers();
  });
});

describe('hasResetQueryParam', () => {
  const originalLocation = globalThis.location;

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('returns true when ?reset is present', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { ...mockLocation, search: '?reset' },
      writable: true,
    });
    expect(hasResetQueryParam()).toBe(true);
  });

  it('returns true when reset is part of query', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { ...mockLocation, search: '?foo=bar&reset=true' },
      writable: true,
    });
    expect(hasResetQueryParam()).toBe(true);
  });

  it('returns false when ?reset is not present', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { ...mockLocation, search: '?foo=bar' },
      writable: true,
    });
    expect(hasResetQueryParam()).toBe(false);
  });

  it('returns false for empty query string', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { ...mockLocation, search: '' },
      writable: true,
    });
    expect(hasResetQueryParam()).toBe(false);
  });
});

describe('getDefaultUI', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('returns metric units for non-US locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-GB' },
      writable: true,
    });
    const ui = getDefaultUI();
    expect(ui.units).toBe('metric');
    expect(ui.debugPanelOpen).toBe(false);
  });

  it('returns imperial units for US locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      writable: true,
    });
    const ui = getDefaultUI();
    expect(ui.units).toBe('imperial');
  });
});

describe('createPersistedState', () => {
  it('creates valid persisted state', () => {
    const simulation = createValidSimulation();
    const ui = { units: 'metric' as const, debugPanelOpen: false };

    const state = createPersistedState(simulation, DEFAULT_CONFIG, ui);

    expect(state.version).toBe(PERSISTENCE_VERSION);
    expect(state.simulation).toBe(simulation);
    expect(state.tunableConfig).toBe(DEFAULT_CONFIG);
    expect(state.ui).toBe(ui);
  });
});

// Helper functions
function createValidSimulation(): PersistedSimulation {
  return {
    tick: 0,
    tank: { capacity: 40, hardscapeSlots: 4 },
    resources: {
      water: 40,
      temperature: 25,
      surface: 1000,
      flow: 100,
      light: 0,
      aeration: false,
      food: 0,
      waste: 0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      phosphate: 0,
      potassium: 0,
      iron: 0,
      oxygen: 8,
      co2: 5,
      ph: 7,
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: 22,
      tapWaterTemperature: 18,
      tapWaterPH: 7.0,
    },
    equipment: {
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 50 },
      lid: { type: 'none' },
      ato: { enabled: false },
      filter: { enabled: true, type: 'hob' },
      powerhead: { enabled: false, flowRateGPH: 240 },
      substrate: { type: 'gravel' },
      hardscape: { items: [] },
      light: { enabled: true, wattage: 10, schedule: { startHour: 8, duration: 8 } },
      co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 8, duration: 8 } },
      airPump: { enabled: false },
      autoDoser: { enabled: false, doseAmountMl: 2, schedule: { startHour: 8, duration: 1 }, dosedToday: false },
    },
    plants: [],
    fish: [],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
      lowOxygen: false,
      highCo2: false,
    },
    currentPreset: 'planted',
  };
}

function createValidPersistedState(): {
  version: number;
  simulation: PersistedSimulation;
  tunableConfig: typeof DEFAULT_CONFIG;
  ui: { units: 'metric'; debugPanelOpen: boolean };
} {
  return {
    version: PERSISTENCE_VERSION,
    simulation: createValidSimulation(),
    tunableConfig: DEFAULT_CONFIG,
    ui: { units: 'metric' as const, debugPanelOpen: false },
  };
}
