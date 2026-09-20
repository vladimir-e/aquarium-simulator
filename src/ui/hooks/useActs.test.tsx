import React, { type ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useActs } from './useActs';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_SETTINGS } from '../actions';
import type { Action } from '../../simulation/index.js';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return <PersistenceProvider>{children}</PersistenceProvider>;
}

function acts(): { hook: ReturnType<typeof renderHook<ReturnType<typeof useActs>, unknown>>; executed: Action[] } {
  const executed: Action[] = [];
  const hook = renderHook(() => useActs((action) => executed.push(action)), { wrapper });
  return { hook, executed };
}

describe('useActs', () => {
  it('opens a verb, and a second ask on the same one shuts it', () => {
    const { hook } = acts();

    act(() => hook.result.current.open('feed'));
    expect(hook.result.current.verb).toBe('feed');

    act(() => hook.result.current.open('feed'));
    expect(hook.result.current.verb).toBeNull();
  });

  it('writes the amount a surface asked for only when it is opening on it', () => {
    const { hook } = acts();

    act(() => hook.result.current.open('dose', 7));
    expect(hook.result.current.settings.dose).toBe(7);

    // The same button again is a dismissal, not a second amount.
    act(() => hook.result.current.open('dose', 9));
    expect(hook.result.current.verb).toBeNull();
    expect(hook.result.current.settings.dose).toBe(7);
  });

  it('leaves the amount and the promoted verb standing when the sheet shuts', () => {
    const { hook, executed } = acts();

    act(() => hook.result.current.open('feed'));
    act(() => hook.result.current.setAmount('feed', 2));
    act(() => hook.result.current.commit('feed'));

    expect(executed).toEqual([{ type: 'feed', amount: 2 }]);
    expect(hook.result.current.verb).toBeNull();
    expect(hook.result.current.promoted).toBe('feed');

    act(() => hook.result.current.close());
    expect(hook.result.current.promoted).toBe('feed');
    expect(hook.result.current.settings.feed).toBe(2);
  });

  it('opens the palette instead of a verb, and shuts the verb it was on', () => {
    const { hook } = acts();

    act(() => hook.result.current.open('topOff'));
    act(() => hook.result.current.openPalette());

    expect(hook.result.current.verb).toBeNull();
    expect(hook.result.current.palette).toBe(true);
  });

  it('starts every amount on the default the tank ships with', () => {
    const { hook } = acts();
    expect(hook.result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('hands the engine the action the settings name', () => {
    const executeAction = vi.fn();
    const hook = renderHook(() => useActs(executeAction), { wrapper });

    act(() => hook.result.current.setAmount('waterChange', 0.5));
    act(() => hook.result.current.commit('waterChange'));

    expect(executeAction).toHaveBeenCalledWith({ type: 'waterChange', amount: 0.5 });
  });
});
