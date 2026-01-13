import { useEffect } from 'react';

export function useKeyboardShortcuts(
  onStep: () => void,
  onTogglePlayPause: () => void,
  isPlaying: boolean
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Spacebar for step/pause, but ignore if typing in an input/textarea/button/select
      if (
        e.code === 'Space' &&
        e.target instanceof HTMLElement &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA' &&
        e.target.tagName !== 'BUTTON' &&
        e.target.tagName !== 'SELECT'
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStep, onTogglePlayPause, isPlaying]);
}
