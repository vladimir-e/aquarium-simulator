import { useEffect } from 'react';

export function useKeyboardShortcuts(onStep: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar for step, but ignore if typing in an input/textarea
      if (
        e.code === 'Space' &&
        e.target instanceof HTMLElement &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        onStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStep]);
}
