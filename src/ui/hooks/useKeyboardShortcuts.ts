import { useEffect } from 'react';

/** Elements that own their keys themselves — typing, activating, or scrolling. */
const KEY_IS_THEIRS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'];

/**
 * Where there is no ⌘, control stands in for it. On a Mac there is one, and
 * control is its own modifier the system and the text fields have spent —
 * ⌃K in a search box kills to the end of the line, and that is not ours.
 */
function ctrlStandsForCommand(): boolean {
  const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  return !/mac/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
}

function chord(e: KeyboardEvent, held: boolean): string {
  const key = e.code === 'Space' ? 'Space' : e.key.toLowerCase();
  return `${held ? '⌘' : ''}${e.shiftKey ? '⇧' : ''}${e.altKey ? '⌥' : ''}${key}`;
}

/**
 * Every shortcut the app answers to, in one map — `Space`, or a prefix per
 * modifier held with it: `⌘` for command, then `⇧`, then `⌥`. Every modifier
 * is part of the chord, so ⇧K is not `k` and an unclaimed chord is left alone.
 * A bare chord yields to whatever the focus is on, because a button pressed
 * with Space is the browser's before it is ours; a held one is the app's
 * wherever the focus sits.
 *
 * The map is a dependency: memoise it, or the listener re-binds every render.
 */
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>): void {
  useEffect(() => {
    const ctrlHolds = ctrlStandsForCommand();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.isComposing) return;
      if (e.ctrlKey && !ctrlHolds) return;

      const held = e.metaKey || e.ctrlKey;
      const run = shortcuts[chord(e, held)];
      if (run === undefined) return;

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
