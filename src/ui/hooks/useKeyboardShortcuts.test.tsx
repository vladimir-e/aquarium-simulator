import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

afterEach(cleanup);

/** Dispatch Space from a non-form element so the window listener sees it. */
function pressSpace(): void {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
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
});
