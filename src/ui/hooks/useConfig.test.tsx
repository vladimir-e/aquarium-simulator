/* eslint-disable no-undef */
// Browser globals (localStorage) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { ConfigProvider, useConfig } from './useConfig.js';
import { PersistenceProvider, STORAGE_KEY } from '../persistence/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';

function createWrapper(): ComponentType<{ children: ReactNode }> {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <PersistenceProvider>
        <ConfigProvider>{children}</ConfigProvider>
      </PersistenceProvider>
    );
  };
}

// Helper to create minimal valid persisted state for testing
function createPersistedState(config: TunableConfig): string {
  return JSON.stringify({
    version: 1,
    simulation: {
      tick: 0,
      tank: { capacity: 40, hardscapeSlots: 4 },
      resources: {
        water: 40, temperature: 25, surface: 0, flow: 0, light: 0, aeration: false,
        food: 0, waste: 0, algae: 0, ammonia: 0, nitrite: 0, nitrate: 0,
        oxygen: 8, co2: 4, ph: 7, aob: 0, nob: 0,
      },
      environment: { roomTemperature: 22, tapWaterTemperature: 20, tapWaterPH: 7 },
      equipment: {
        heater: { enabled: false, isOn: false, targetTemperature: 25, wattage: 100 },
        lid: { type: 'none' },
        ato: { enabled: false },
        filter: { enabled: false, type: 'hob' },
        powerhead: { enabled: false, flowRateGPH: 200 },
        substrate: { type: 'none' },
        hardscape: { items: [] },
        light: { enabled: false, wattage: 10, schedule: { startHour: 8, duration: 8 } },
        co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 7, duration: 10 } },
        airPump: { enabled: false },
      },
      plants: [],
      alertState: {
        waterLevelCritical: false, highAlgae: false, highAmmonia: false,
        highNitrite: false, highNitrate: false, lowOxygen: false, highCo2: false,
      },
    },
    tunableConfig: config,
    ui: { units: 'metric', debugPanelOpen: false },
  });
}

describe('useConfig', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
    vi.useRealTimers();
  });

  describe('loading from localStorage', () => {
    it('loads defaults when localStorage is empty', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('loads stored config from localStorage', () => {
      const customConfig = {
        ...DEFAULT_CONFIG,
        decay: { ...DEFAULT_CONFIG.decay, wasteConversionRatio: 0.5 },
      };
      globalThis.localStorage.setItem(STORAGE_KEY, createPersistedState(customConfig));

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config.decay.wasteConversionRatio).toBe(0.5);
    });

    it('handles corrupted localStorage gracefully', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'not-valid-json');

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('handles non-object stored values', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('handles invalid version by falling back to defaults', () => {
      const invalidVersionState = {
        version: 999,
        simulation: {},
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric', debugPanelOpen: false },
      };
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidVersionState));

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('updating config', () => {
    it('updates config values correctly', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.config.decay.wasteConversionRatio).toBe(0.7);
    });

    it('resetConfig returns to defaults', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.config.decay.wasteConversionRatio).toBe(0.7);

      act(() => {
        result.current.resetConfig();
      });

      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('saves config to unified storage after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      // Wait for debounce
      act(() => {
        vi.advanceTimersByTime(600);
      });

      const rawStored = globalThis.localStorage.getItem(STORAGE_KEY);
      expect(rawStored).not.toBeNull();
      const stored = JSON.parse(rawStored!);
      expect(stored.version).toBe(1);
      expect(stored.tunableConfig.decay.wasteConversionRatio).toBe(0.7);
    });
  });

  describe('config includes all DEFAULT_CONFIG sections', () => {
    it('has all sections that DEFAULT_CONFIG has', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      const defaultSections = Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[];
      const configSections = Object.keys(result.current.config) as (keyof TunableConfig)[];

      expect(configSections.sort()).toEqual(defaultSections.sort());
    });
  });
});
