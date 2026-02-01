/* eslint-disable no-undef */
// Browser globals (localStorage) are available in test environment
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { ConfigProvider, useConfig } from './useConfig.js';
import { PersistenceProvider } from '../persistence/index.js';
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

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('loads defaults when localStorage is empty', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('has all sections that DEFAULT_CONFIG has', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      const defaultSections = Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[];
      const configSections = Object.keys(result.current.config) as (keyof TunableConfig)[];

      expect(configSections.sort()).toEqual(defaultSections.sort());
    });
  });

  describe('updating config', () => {
    it('updates config values', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.config.decay.wasteConversionRatio).toBe(0.7);
    });

    it('marks value as modified after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      expect(result.current.isValueModified('decay', 'wasteConversionRatio')).toBe(false);

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.isValueModified('decay', 'wasteConversionRatio')).toBe(true);
    });

    it('marks section as modified after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      expect(result.current.isSectionModified('decay')).toBe(false);

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.isSectionModified('decay')).toBe(true);
    });

    it('marks isAnyModified as true after update', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      expect(result.current.isAnyModified).toBe(false);

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
      });

      expect(result.current.isAnyModified).toBe(true);
    });
  });

  describe('resetting config', () => {
    it('resetConfig restores all defaults', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
        result.current.updateConfig('algae', 'maxGrowthRate', 0.5);
      });

      expect(result.current.isAnyModified).toBe(true);

      act(() => {
        result.current.resetConfig();
      });

      expect(result.current.config).toEqual(DEFAULT_CONFIG);
      expect(result.current.isAnyModified).toBe(false);
    });

    it('resetSection restores single section defaults', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.updateConfig('decay', 'wasteConversionRatio', 0.7);
        result.current.updateConfig('algae', 'maxGrowthRate', 0.5);
      });

      expect(result.current.isSectionModified('decay')).toBe(true);
      expect(result.current.isSectionModified('algae')).toBe(true);

      act(() => {
        result.current.resetSection('decay');
      });

      expect(result.current.isSectionModified('decay')).toBe(false);
      expect(result.current.isSectionModified('algae')).toBe(true);
    });
  });

  describe('debug panel state', () => {
    it('debug panel is closed by default', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
      expect(result.current.isDebugPanelOpen).toBe(false);
    });

    it('toggleDebugPanel toggles state', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.toggleDebugPanel();
      });
      expect(result.current.isDebugPanelOpen).toBe(true);

      act(() => {
        result.current.toggleDebugPanel();
      });
      expect(result.current.isDebugPanelOpen).toBe(false);
    });

    it('setDebugPanelOpen sets state directly', () => {
      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      act(() => {
        result.current.setDebugPanelOpen(true);
      });
      expect(result.current.isDebugPanelOpen).toBe(true);

      act(() => {
        result.current.setDebugPanelOpen(false);
      });
      expect(result.current.isDebugPanelOpen).toBe(false);
    });
  });
});
