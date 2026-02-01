/* eslint-disable no-undef */
// Browser globals (localStorage) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { UnitsProvider, useUnits } from './useUnits';
import { PersistenceProvider, STORAGE_KEY, LEGACY_KEYS } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

function createWrapper(): ComponentType<{ children: ReactNode }> {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <PersistenceProvider>
        <UnitsProvider>{children}</UnitsProvider>
      </PersistenceProvider>
    );
  };
}

// Helper to create minimal valid persisted state for testing
function createPersistedState(units: 'metric' | 'imperial'): string {
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
    tunableConfig: DEFAULT_CONFIG,
    ui: { units, debugPanelOpen: false },
  });
}

describe('useUnits', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('throws when used outside UnitsProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useUnits());
    }).toThrow('useUnits must be used within a UnitsProvider');

    consoleSpy.mockRestore();
  });

  it('provides unit system state', () => {
    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    expect(result.current.unitSystem).toBeDefined();
    expect(['metric', 'imperial']).toContain(result.current.unitSystem);
  });

  it('toggles between metric and imperial', () => {
    // Start with metric via legacy key (tests migration)
    globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    expect(result.current.unitSystem).toBe('metric');

    act(() => {
      result.current.toggleUnits();
    });

    expect(result.current.unitSystem).toBe('imperial');

    act(() => {
      result.current.toggleUnits();
    });

    expect(result.current.unitSystem).toBe('metric');
  });

  it('setUnitSystem updates unit system', () => {
    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setUnitSystem('imperial');
    });

    expect(result.current.unitSystem).toBe('imperial');

    act(() => {
      result.current.setUnitSystem('metric');
    });

    expect(result.current.unitSystem).toBe('metric');
  });

  it('loads preference from legacy localStorage key on mount', () => {
    // Tests legacy key migration
    globalThis.localStorage.setItem(LEGACY_KEYS.units, 'imperial');

    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    expect(result.current.unitSystem).toBe('imperial');
  });

  it('loads preference from new unified key on mount', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, createPersistedState('imperial'));

    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    expect(result.current.unitSystem).toBe('imperial');
  });

  describe('formatting functions', () => {
    it('formatTemp formats temperature based on unit system', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.formatTemp(25)).toBe('25.0°C');

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.formatTemp(25)).toBe('77.0°F');
    });

    it('formatVol formats volume based on unit system', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.formatVol(10)).toBe('10.0 L');

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.formatVol(10)).toBe('2.6 gal');
    });

    it('tempUnit returns correct unit label', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.tempUnit).toBe('°C');

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.tempUnit).toBe('°F');
    });

    it('volUnit returns correct unit label', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.volUnit).toBe('L');

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.volUnit).toBe('gal');
    });
  });

  describe('conversion functions', () => {
    it('displayTemp converts internal celsius to display value', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.displayTemp(25)).toBe(25);

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.displayTemp(25)).toBe(77);
    });

    it('displayVol converts internal liters to display value', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.displayVol(10)).toBe(10);

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.displayVol(10)).toBeCloseTo(2.64, 2);
    });

    it('internalTemp converts display value to internal celsius', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.internalTemp(25)).toBe(25);

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.internalTemp(77)).toBe(25);
    });

    it('internalVol converts display value to internal liters', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');

      const { result } = renderHook(() => useUnits(), {
        wrapper: createWrapper(),
      });

      expect(result.current.internalVol(10)).toBe(10);

      act(() => {
        result.current.setUnitSystem('imperial');
      });

      expect(result.current.internalVol(1)).toBeCloseTo(3.785, 2);
    });
  });
});
