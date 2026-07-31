import { useEffect } from 'react';

/** Elements that own Space themselves — typing, activating, or scrolling. */
const SPACE_IS_THEIRS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'];

export function useKeyboardShortcuts(
  onStep: () => void,
  onTogglePlayPause: () => void,
  isPlaying: boolean
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        e.code === 'Space' &&
        e.target instanceof HTMLElement &&
        !SPACE_IS_THEIRS.includes(e.target.tagName)
      ) {
        e.preventDefault();
        if (isPlaying) {
          onTogglePlayPause();
        } else {
          onStep();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [onStep, onTogglePlayPause, isPlaying]);
}
