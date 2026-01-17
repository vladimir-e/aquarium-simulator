/* eslint-disable no-undef */
// Browser globals (localStorage) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { UnitsProvider, useUnits } from './useUnits';

function createWrapper(): ComponentType<{ children: ReactNode }> {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return <UnitsProvider>{children}</UnitsProvider>;
  };
}

describe('useUnits', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
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
    // Start with metric by clearing localStorage
    localStorage.setItem('aquarium-units', 'metric');

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

  it('persists preference to localStorage', () => {
    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setUnitSystem('imperial');
    });

    expect(localStorage.getItem('aquarium-units')).toBe('imperial');
  });

  it('loads preference from localStorage on mount', () => {
    localStorage.setItem('aquarium-units', 'imperial');

    const { result } = renderHook(() => useUnits(), {
      wrapper: createWrapper(),
    });

    expect(result.current.unitSystem).toBe('imperial');
  });

  describe('formatting functions', () => {
    it('formatTemp formats temperature based on unit system', () => {
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
      localStorage.setItem('aquarium-units', 'metric');

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
