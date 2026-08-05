import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createSimulation, tick, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { useExpandedRows } from './useExpandedRows';

const tank = (rngSeed: number): SimulationState =>
  createSimulation({ tankCapacity: 40 }, undefined, rngSeed);

describe('useExpandedRows', () => {
  it('opens a row on the first toggle and closes it on the next', () => {
    const { result } = renderHook(() => useExpandedRows(tank(1)));

    act(() => result.current[1]('fish_3'));
    expect(result.current[0].has('fish_3')).toBe(true);

    act(() => result.current[1]('fish_3'));
    expect(result.current[0].has('fish_3')).toBe(false);
  });

  it('holds what is open while the tank runs', () => {
    const state = tank(1);
    const { result, rerender } = renderHook(({ of }) => useExpandedRows(of), {
      initialProps: { of: state },
    });

    act(() => result.current[1]('fish_3'));
    rerender({ of: tick(state, DEFAULT_CONFIG) });

    expect(result.current[0].has('fish_3')).toBe(true);
  });

  it('drops it when the tank is replaced, ids being the new tank’s to reuse', () => {
    const { result, rerender } = renderHook(({ of }) => useExpandedRows(of), {
      initialProps: { of: tank(1) },
    });

    act(() => result.current[1]('fish_3'));
    rerender({ of: tank(2) });

    expect(result.current[0].has('fish_3')).toBe(false);
  });
});
