import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

afterEach(() => {
  document.body.innerHTML = '';
  cleanup();
});

type Chord = { code?: string; key?: string; metaKey?: boolean; ctrlKey?: boolean };

function press(init: Chord, from: HTMLElement = document.body): void {
  from.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
}

function focusable(tag: string): HTMLElement {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

describe('useKeyboardShortcuts', () => {
  it('runs the chord it was given, and nothing it was not', () => {
    const space = vi.fn();
    const act = vi.fn();
    renderHook(() => useKeyboardShortcuts({ Space: space, '⌘k': act }));

    press({ code: 'Space' });
    expect(space).toHaveBeenCalledTimes(1);

    press({ key: 'k', metaKey: true });
    expect(act).toHaveBeenCalledTimes(1);

    press({ key: ',', metaKey: true });
    expect(space).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('reads Ctrl as ⌘, for the keyboards that have no ⌘', () => {
    const tunables = vi.fn();
    renderHook(() => useKeyboardShortcuts({ '⌘,': tunables }));

    press({ key: ',', ctrlKey: true });
    expect(tunables).toHaveBeenCalledTimes(1);
  });

  it('tells a bare chord from a held one on the same key', () => {
    const bare = vi.fn();
    const held = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: bare, '⌘k': held }));

    press({ key: 'k' });
    expect(bare).toHaveBeenCalledTimes(1);
    expect(held).not.toHaveBeenCalled();

    press({ key: 'k', metaKey: true });
    expect(held).toHaveBeenCalledTimes(1);
    expect(bare).toHaveBeenCalledTimes(1);
  });

  it('yields a bare chord to the element that owns the key', () => {
    // Anchors matter as much as form controls: the rail's nav rows are links,
    // so after a click Space would otherwise step a simulated day.
    for (const tag of ['input', 'textarea', 'button', 'select', 'a']) {
      const space = vi.fn();
      const { unmount } = renderHook(() => useKeyboardShortcuts({ Space: space }));

      press({ code: 'Space' }, focusable(tag));

      expect(space, tag).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('keeps a held chord wherever the focus is', () => {
    const act = vi.fn();
    renderHook(() => useKeyboardShortcuts({ '⌘k': act }));

    press({ key: 'k', metaKey: true }, focusable('input'));

    expect(act).toHaveBeenCalledTimes(1);
  });
});
