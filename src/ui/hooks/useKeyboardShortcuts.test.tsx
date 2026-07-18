import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

afterEach(cleanup);

/** Dispatch Space from a non-form element so the window listener sees it. */
function pressSpace(): void {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
}

describe('useKeyboardShortcuts', () => {
  it('steps on Space when enabled and paused', () => {
    const onStep = vi.fn();
    const onToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts(onStep, onToggle, false, true));

    pressSpace();

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('ignores Space when disabled (Build mode)', () => {
    const onStep = vi.fn();
    const onToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts(onStep, onToggle, false, false));

    pressSpace();

    expect(onStep).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
