import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsConfig {
  onStep: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
}

export function useKeyboardShortcuts({
  onStep,
  onTogglePlay,
  isPlaying,
}: KeyboardShortcutsConfig) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          if (!isPlaying) {
            onStep();
          }
          break;
        case 'KeyP':
          event.preventDefault();
          onTogglePlay();
          break;
      }
    },
    [onStep, onTogglePlay, isPlaying]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
