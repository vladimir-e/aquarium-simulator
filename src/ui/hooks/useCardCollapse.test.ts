import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCardCollapse } from './useCardCollapse';
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(false);
  globalThis.localStorage.clear();
});

afterEach(() => {
  media.restore();
  cleanup();
});

describe('useCardCollapse', () => {
  it('shows the toggle only on mobile (showToggle === isMobile)', () => {
    media.set(true);
    const mobile = renderHook(() => useCardCollapse('t.a'));
    expect(mobile.result.current.showToggle).toBe(true);
    mobile.unmount();

    media.set(false);
    const desktop = renderHook(() => useCardCollapse('t.a'));
    expect(desktop.result.current.showToggle).toBe(false);
  });

  it('defaults expanded and toggles collapsed, persisting the change', () => {
    media.set(true);
    const { result } = renderHook(() => useCardCollapse('t.b'));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(globalThis.localStorage.getItem('aqsim.ui.card.t.b')).toBe('true');
  });

  it('exposes a stable region id for aria wiring', () => {
    media.set(true);
    const { result } = renderHook(() => useCardCollapse('t.c'));
    expect(typeof result.current.regionId).toBe('string');
    expect(result.current.regionId.length).toBeGreaterThan(0);
  });
});
