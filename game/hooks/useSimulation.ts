import { useState, useCallback } from 'react';
// Future: import { SimulationState, createSimulation, tick } from '@simulation';

/**
 * Simulation state stub
 * This will be replaced with actual SimulationState from the engine
 */
interface SimulationStateStub {
  tick: number;
  resources: {
    temperature: number;
    water: number;
    ph: number;
    algae: number;
  };
}

/**
 * useSimulation - Hook for managing simulation state
 *
 * This is a stub that will be wired to the actual simulation engine
 * in a future task. Currently returns placeholder data.
 *
 * Future implementation will:
 * - Create and manage SimulationState
 * - Handle tick updates
 * - Support play/pause/fast-forward
 * - Persist state
 */
interface UseSimulationResult {
  state: SimulationStateStub;
  isPlaying: boolean;
  isFastForward: boolean;
  play: () => void;
  pause: () => void;
  toggleFastForward: () => void;
  advanceTick: () => void;
}

export function useSimulation(): UseSimulationResult {
  const [state, setState] = useState<SimulationStateStub>({
    tick: 11, // 11:00 on day 1
    resources: {
      temperature: 78,
      water: 98,
      ph: 7.2,
      algae: 5,
    },
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);

  const play = useCallback((): void => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback((): void => {
    setIsPlaying(false);
    setIsFastForward(false);
  }, []);

  const toggleFastForward = useCallback((): void => {
    if (!isPlaying) {
      setIsPlaying(true);
    }
    setIsFastForward((prev) => !prev);
  }, [isPlaying]);

  const advanceTick = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      tick: prev.tick + 1,
    }));
  }, []);

  return {
    state,
    isPlaying,
    isFastForward,
    play,
    pause,
    toggleFastForward,
    advanceTick,
  };
}

/**
 * Helper to get hour of day from tick
 */
export function getHourFromTick(tick: number): number {
  return tick % 24;
}

/**
 * Helper to get day number from tick
 */
export function getDayFromTick(tick: number): number {
  return Math.floor(tick / 24) + 1;
}

/**
 * Format time from tick
 */
export function formatTime(tick: number): string {
  const hour = getHourFromTick(tick);
  return `${hour.toString().padStart(2, '0')}:00`;
}
