import { useEffect } from 'react';

/** Elements that own their keys themselves — typing, activating, or scrolling. */
const KEY_IS_THEIRS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'];

function chord(e: KeyboardEvent): string {
  const key = e.code === 'Space' ? 'Space' : e.key.toLowerCase();
  return e.metaKey || e.ctrlKey ? `⌘${key}` : key;
}

/**
 * Every shortcut the app answers to, in one map — `Space`, or a `⌘` prefix for
 * one held with command (control, off a Mac). A bare chord yields to whatever
 * the focus is on, because a button pressed with Space is the browser's before
 * it is ours; a held one is the app's wherever the focus sits.
 *
 * The map is a dependency: memoise it, or the listener re-binds every render.
 */
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const run = shortcuts[chord(e)];
      if (run === undefined) return;

      const held = e.metaKey || e.ctrlKey;
      if (!held && e.target instanceof HTMLElement && KEY_IS_THEIRS.includes(e.target.tagName)) {
        return;
      }

      e.preventDefault();
      run();
    };

    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
