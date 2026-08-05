import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExpandedRows } from './useExpandedRows';

describe('useExpandedRows', () => {
  it('opens a row on the first toggle and closes it on the next', () => {
    const { result } = renderHook(() => useExpandedRows(0));

    act(() => result.current[1]('fish_3'));
    expect(result.current[0].has('fish_3')).toBe(true);

    act(() => result.current[1]('fish_3'));
    expect(result.current[0].has('fish_3')).toBe(false);
  });

  it('holds what is open while the tank runs', () => {
    const { result, rerender } = renderHook(({ of }) => useExpandedRows(of), {
      initialProps: { of: 0 },
    });

    act(() => result.current[1]('fish_3'));
    rerender({ of: 0 });

    expect(result.current[0].has('fish_3')).toBe(true);
  });

  it('drops it when the tank is replaced, ids being the new tank’s to reuse', () => {
    const { result, rerender } = renderHook(({ of }) => useExpandedRows(of), {
      initialProps: { of: 0 },
    });

    act(() => result.current[1]('fish_3'));
    rerender({ of: 1 });

    expect(result.current[0].has('fish_3')).toBe(false);
  });
});
