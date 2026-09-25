/* eslint-disable no-undef */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode, type ComponentType } from 'react';
import { ConfigProvider, useConfig } from './useConfig.js';
import { PersistenceProvider } from '../persistence/index.js';
import {
  DEFAULT_CONFIG,
  countModified,
  type TunableConfig,
} from '../../simulation/config/index.js';

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

  it('opens on the stock config, every section of it', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    expect(result.current.config).toEqual(DEFAULT_CONFIG);
    const sections = Object.keys(DEFAULT_CONFIG) as (keyof TunableConfig)[];
    expect(Object.keys(result.current.config).sort()).toEqual([...sections].sort());
  });

  it('writes a constant by the path `config set` names it with', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    act(() => result.current.setTunable('decay.wasteConversionRatio', 0.7));

    expect(result.current.config.decay.wasteConversionRatio).toBe(0.7);
    expect(countModified(result.current.config)).toBe(1);
  });

  it('reaches a nested formula the section list cannot address', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    act(() => result.current.setTunable('nutrients.fertilizerFormula.iron', 0.5));

    expect(result.current.config.nutrients.fertilizerFormula.iron).toBe(0.5);
    expect(countModified(result.current.config)).toBe(1);
  });

  it('resets a section without touching its neighbours', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    act(() => {
      result.current.setTunable('decay.wasteConversionRatio', 0.7);
      result.current.setTunable('algae.hardiness', 0.5);
    });
    act(() => result.current.resetSection('decay'));

    expect(result.current.config.decay).toEqual(DEFAULT_CONFIG.decay);
    expect(result.current.config.algae.hardiness).toBe(0.5);
  });

  it('resets the whole config at once', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    act(() => {
      result.current.setTunable('decay.wasteConversionRatio', 0.7);
      result.current.setTunable('nutrients.fertilizerFormula.iron', 0.5);
    });
    act(() => result.current.resetAll());

    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it('keeps the drawer shut until something opens it', () => {
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
    expect(result.current.tunablesOpen).toBe(false);

    act(() => result.current.setTunablesOpen(true));
    expect(result.current.tunablesOpen).toBe(true);
  });
});
