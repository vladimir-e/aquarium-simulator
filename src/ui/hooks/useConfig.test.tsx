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
        decay: { ...DEFAULT_CONFIG.decay, wasteConversionRatio: 0.5 },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify({ version: 1, config: customConfig })
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config.decay.wasteConversionRatio).toBe(0.5);
    });

    it('discards unversioned format and uses defaults', () => {
      const unversionedConfig = {
        decay: { wasteFraction: 0.6 },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(unversionedConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // Should use defaults, not stored values
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
      // Invalid config should have been removed
      expect(localStorage.getItem('aquarium-tunable-config')).toBeNull();
    });

    it('handles missing sections by using defaults while preserving stored sections', () => {
      // This is the bug scenario: stored config missing a section
      const customDecay = { ...DEFAULT_CONFIG.decay, wasteConversionRatio: 0.75 };
      const incompleteConfig = {
        version: 1,
        config: {
          decay: customDecay,
          // Missing: all other sections
        },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(incompleteConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // Stored section values should be preserved
      expect(result.current.config.decay.wasteConversionRatio).toBe(0.75);

      // Missing sections should have default values
      expect(result.current.config.plants).toEqual(DEFAULT_CONFIG.plants);
      expect(result.current.config.gasExchange).toEqual(DEFAULT_CONFIG.gasExchange);
      expect(result.current.config.nitrogenCycle).toEqual(DEFAULT_CONFIG.nitrogenCycle);
    });

    it('discards stored config when version mismatches', () => {
      const oldVersionConfig = {
        version: 0, // Old version
        config: {
          decay: { wasteConversionRatio: 0.9 },
        },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(oldVersionConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // Should use defaults, not the stored value
      expect(result.current.config.decay.wasteConversionRatio).toBe(
        DEFAULT_CONFIG.decay.wasteConversionRatio
      );
      // Invalid config should have been removed
      expect(localStorage.getItem('aquarium-tunable-config')).toBeNull();
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

    it('ignores invalid types and unknown keys in stored config', () => {
      const corruptedConfig = {
        version: 1,
        config: {
          decay: {
            wasteConversionRatio: 'not a number', // Invalid type - should use default
            baseDecayRate: 0.08, // Valid - should be preserved
            unknownKey: 999, // Unknown key - should be ignored
          },
        },
      };
      localStorage.setItem(
        'aquarium-tunable-config',
        JSON.stringify(corruptedConfig)
      );

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      // Invalid type should fall back to default
      expect(result.current.config.decay.wasteConversionRatio).toBe(
        DEFAULT_CONFIG.decay.wasteConversionRatio
      );
      // Valid value should be preserved
      expect(result.current.config.decay.baseDecayRate).toBe(0.08);
      // Unknown key should not exist
      expect('unknownKey' in result.current.config.decay).toBe(false);
    });
  });

  describe('saving to localStorage', () => {
    it('saves config with version after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      // Wait for debounce
      act(() => {
        vi.advanceTimersByTime(600);
      });

      const rawStored = localStorage.getItem('aquarium-tunable-config');
      expect(rawStored).not.toBeNull();
      const stored = JSON.parse(rawStored!);
      expect(stored.version).toBe(1);
      expect(stored.config.decay.wasteConversionRatio).toBe(0.7);
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
