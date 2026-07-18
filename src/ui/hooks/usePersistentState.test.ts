import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

beforeEach(() => globalThis.localStorage.clear());
afterEach(cleanup);

describe('usePersistentState', () => {
  it('returns the initial value when storage is empty', () => {
    const { result } = renderHook(() => usePersistentState('t.a', false));
    expect(result.current[0]).toBe(false);
  });

  it('persists updates under a namespaced key and reflects them', () => {
    const { result } = renderHook(() => usePersistentState('t.b', false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(globalThis.localStorage.getItem('aqsim.ui.t.b')).toBe('true');
  });

  it('hydrates a fresh hook from previously stored state (survives remount)', () => {
    globalThis.localStorage.setItem('aqsim.ui.t.c', 'true');
    const { result } = renderHook(() => usePersistentState('t.c', false));
    expect(result.current[0]).toBe(true);
  });

  it('supports a function updater', () => {
    const { result } = renderHook(() => usePersistentState('t.d', 1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
    expect(globalThis.localStorage.getItem('aqsim.ui.t.d')).toBe('2');
  });

  it('falls back to the initial value when stored JSON is corrupt', () => {
    globalThis.localStorage.setItem('aqsim.ui.t.e', '{not json');
    const { result } = renderHook(() => usePersistentState('t.e', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
