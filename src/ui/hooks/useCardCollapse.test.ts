import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCardCollapse } from './useCardCollapse';

function mediaQueryList(matches: boolean): ReturnType<typeof globalThis.matchMedia> {
  const noop = (): void => {};
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: (): boolean => false,
  } as unknown as ReturnType<typeof globalThis.matchMedia>;
}

let restore: () => void;

function forceViewport(isMobile: boolean): void {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = (() => mediaQueryList(isMobile)) as unknown as typeof globalThis.matchMedia;
  restore = (): void => {
    globalThis.matchMedia = original;
  };
}

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => {
  restore?.();
  cleanup();
});

describe('useCardCollapse', () => {
  it('shows the toggle only on mobile (showToggle === isMobile)', () => {
    forceViewport(true);
    const mobile = renderHook(() => useCardCollapse('t.a'));
    expect(mobile.result.current.showToggle).toBe(true);
    mobile.unmount();

    restore();
    forceViewport(false);
    const desktop = renderHook(() => useCardCollapse('t.a'));
    expect(desktop.result.current.showToggle).toBe(false);
  });

  it('defaults expanded and toggles collapsed, persisting the change', () => {
    forceViewport(true);
    const { result } = renderHook(() => useCardCollapse('t.b'));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(globalThis.localStorage.getItem('aqsim.ui.card.t.b')).toBe('true');
  });

  it('exposes a stable region id for aria wiring', () => {
    forceViewport(true);
    const { result } = renderHook(() => useCardCollapse('t.c'));
    expect(typeof result.current.regionId).toBe('string');
    expect(result.current.regionId.length).toBeGreaterThan(0);
  });
});
