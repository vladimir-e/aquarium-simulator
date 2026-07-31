import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useIsMobile } from './useMediaQuery';
import { stubMatchMedia, viewport } from '../test/matchMedia';

afterEach(cleanup);

/** Controllable matchMedia whose match can be flipped and broadcast to listeners. */
function installMatchMedia(initial: boolean): {
  flip: (next: boolean) => void;
  listenerCount: () => number;
  restore: () => void;
} {
  const listeners = new Set<() => void>();
  const state = { matches: initial };
  const mql = {
    get matches(): boolean {
      return state.matches;
    },
    media: '',
    onchange: null,
    addEventListener: (_type: string, cb: () => void): void => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: () => void): void => {
      listeners.delete(cb);
    },
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  };
  const original = globalThis.matchMedia;
  globalThis.matchMedia = (() => mql) as unknown as typeof globalThis.matchMedia;
  return {
    flip(next: boolean): void {
      state.matches = next;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
    restore(): void {
      globalThis.matchMedia = original;
    },
  };
}

describe('useIsMobile', () => {
  it('resolves the initial match synchronously', () => {
    const mm = installMatchMedia(true);
    try {
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);
    } finally {
      mm.restore();
    }
  });

  it('updates live when the query flips', () => {
    const mm = installMatchMedia(false);
    try {
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
      act(() => mm.flip(true));
      expect(result.current).toBe(true);
    } finally {
      mm.restore();
    }
  });

  it('adds a change listener on mount and removes it on unmount', () => {
    const mm = installMatchMedia(false);
    try {
      const { unmount } = renderHook(() => useIsMobile());
      expect(mm.listenerCount()).toBe(1);
      unmount();
      expect(mm.listenerCount()).toBe(0);
    } finally {
      mm.restore();
    }
  });

  /**
   * The whole point of one breakpoint: the tablet band between Tailwind's `sm`
   * and `md` is mobile, because that is where the rail stops fitting.
   */
  it.each([
    [390, true],
    [700, true],
    [767, true],
    [768, false],
    [1280, false],
  ])('reads %i px as mobile: %s', (width, expected) => {
    const media = stubMatchMedia(viewport(width));
    try {
      expect(renderHook(() => useIsMobile()).result.current).toBe(expected);
    } finally {
      media.restore();
    }
  });
});
