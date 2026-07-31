import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

afterEach(() => {
  document.body.innerHTML = '';
  cleanup();
});

/** Dispatch Space from a non-form element so the window listener sees it. */
function pressSpace(from: HTMLElement = document.body): void {
  from.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
}

function focusable(tag: string): HTMLElement {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

describe('useKeyboardShortcuts', () => {
  it('steps on Space while paused', () => {
    const onStep = vi.fn();
    const onToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts(onStep, onToggle, false));

    pressSpace();

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('pauses on Space while playing', () => {
    const onStep = vi.fn();
    const onToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts(onStep, onToggle, true));

    pressSpace();

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('yields Space to the element that owns it', () => {
    // Anchors matter as much as form controls: the index rail's nav rows are
    // links, so after a click Space would otherwise step a simulated day.
    for (const tag of ['input', 'textarea', 'button', 'select', 'a']) {
      const onStep = vi.fn();
      const onToggle = vi.fn();
      const { unmount } = renderHook(() => useKeyboardShortcuts(onStep, onToggle, false));

      pressSpace(focusable(tag));

      expect(onStep, tag).not.toHaveBeenCalled();
      expect(onToggle, tag).not.toHaveBeenCalled();
      unmount();
    }
  });
});
