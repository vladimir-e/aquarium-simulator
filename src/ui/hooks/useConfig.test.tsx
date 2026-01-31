/* eslint-disable no-undef */
// Browser globals (localStorage) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { ConfigProvider, useConfig } from './useConfig.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';

function createWrapper(): ComponentType<{ children: ReactNode }> {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return <ConfigProvider>{children}</ConfigProvider>;
  };
}

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('loading from localStorage', () => {
    it('loads defaults when localStorage is empty', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('loads stored config with versioned format', () => {
      const customConfig = {
        ...DEFAULT_CONFIG,
        decay: { ...DEFAULT_CONFIG.decay, wasteFraction: 0.5 },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify({ version: 1, config: customConfig })
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config.decay.wasteFraction).toBe(0.5);
    });

    it('migrates legacy format (no version) and merges with defaults', () => {
      // Legacy format: just the config object without version wrapper
      const legacyConfig = {
        decay: { wasteFraction: 0.6 },
        // Missing other sections - should be filled from defaults
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(legacyConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      // Should have the stored value
      expect(result.current.config.decay.wasteFraction).toBe(0.6);
      // Should have default values for other decay properties
      expect(result.current.config.decay.baseRate).toBe(
        DEFAULT_CONFIG.decay.baseRate
      );
      // Should have all sections from defaults
      expect(result.current.config.plants).toBeDefined();
      expect(result.current.config.gasExchange).toBeDefined();
    });

    it('handles missing sections by using defaults', () => {
      // This is the bug scenario: stored config missing a section
      const incompleteConfig = {
        version: 1,
        config: {
          decay: DEFAULT_CONFIG.decay,
          nitrogenCycle: DEFAULT_CONFIG.nitrogenCycle,
          // Missing: gasExchange, temperature, evaporation, algae, ph, plants
        },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(incompleteConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // All sections should be present
      expect(result.current.config.gasExchange).toBeDefined();
      expect(result.current.config.temperature).toBeDefined();
      expect(result.current.config.evaporation).toBeDefined();
      expect(result.current.config.algae).toBeDefined();
      expect(result.current.config.ph).toBeDefined();
      expect(result.current.config.plants).toBeDefined();

      // They should have default values
      expect(result.current.config.plants).toEqual(DEFAULT_CONFIG.plants);
    });

    it('discards stored config when version mismatches', () => {
      const oldVersionConfig = {
        version: 0, // Old version
        config: {
          decay: { wasteFraction: 0.9 },
        },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(oldVersionConfig)
      );
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // Should use defaults, not the stored value
      expect(result.current.config.decay.wasteFraction).toBe(
        DEFAULT_CONFIG.decay.wasteFraction
      );
      // Should have removed the invalid stored config
      expect(removeItemSpy).toHaveBeenCalledWith('aquarium-tunable-config');

      removeItemSpy.mockRestore();
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('aquarium-tunable-config', 'not-valid-json');

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('handles non-object stored values', () => {
      localStorage.setItem('aquarium-tunable-config', JSON.stringify([1, 2, 3]));

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('saving to localStorage', () => {
    it('saves config with version after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteFraction', 0.7);
      });

      // Wait for debounce
      act(() => {
        vi.advanceTimersByTime(600);
      });

      const stored = JSON.parse(localStorage.getItem('aquarium-tunable-config')!);
      expect(stored.version).toBe(1);
      expect(stored.config.decay.wasteFraction).toBe(0.7);
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
