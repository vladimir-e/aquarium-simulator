import { useState, useCallback, useRef } from 'react';
import { produce } from 'immer';
import {
  createSimulation,
  tick as simulationTick,
  type SimulationState,
} from '../../simulation/index.js';

export type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  '1hr': 1,
  '6hr': 6,
  '12hr': 12,
  '1day': 24,
};

export function useSimulation(initialCapacity = 75) {
  const [state, setState] = useState<SimulationState>(() =>
    createSimulation({
      tankCapacity: initialCapacity,
      initialTemperature: 25,
      roomTemperature: 22,
      heater: {
        enabled: true,
        targetTemperature: 25,
        wattage: 100,
      },
    })
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedPreset>('1hr');
  const intervalRef = useRef<number | null>(null);

  const step = useCallback(() => {
    const multiplier = SPEED_MULTIPLIERS[speed];
    setState((current) => {
      let nextState = current;
      for (let i = 0; i < multiplier; i++) {
        nextState = simulationTick(nextState);
      }
      return nextState;
    });
  }, [speed]);

  const startAutoPlay = useCallback(() => {
    if (intervalRef.current) return;

    const ticksPerSecond = SPEED_MULTIPLIERS[speed];
    const intervalMs = 1000 / ticksPerSecond;

    intervalRef.current = window.setInterval(() => {
      setState((current) => simulationTick(current));
    }, intervalMs);
  }, [speed]);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev) {
        startAutoPlay();
      } else {
        stopAutoPlay();
      }
      return !prev;
    });
  }, [startAutoPlay, stopAutoPlay]);

  const changeSpeed = useCallback(
    (newSpeed: SpeedPreset) => {
      setSpeed(newSpeed);
      if (isPlaying) {
        stopAutoPlay();
        // Restart with new speed
        const ticksPerSecond = SPEED_MULTIPLIERS[newSpeed];
        const intervalMs = 1000 / ticksPerSecond;

        intervalRef.current = window.setInterval(() => {
          setState((current) => simulationTick(current));
        }, intervalMs);
      }
    },
    [isPlaying, stopAutoPlay]
  );

  const updateHeaterEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.enabled = enabled;
      })
    );
  }, []);

  const updateHeaterTargetTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.targetTemperature = temp;
      })
    );
  }, []);

  const updateHeaterWattage = useCallback((wattage: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.wattage = wattage;
      })
    );
  }, []);

  const updateRoomTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.environment.roomTemperature = temp;
      })
    );
  }, []);

  const changeTankCapacity = useCallback(
    (capacity: number) => {
      // Stop playing if currently running
      if (isPlaying) {
        stopAutoPlay();
        setIsPlaying(false);
      }

      // Reinitialize simulation with new capacity
      setState(
        createSimulation({
          tankCapacity: capacity,
          initialTemperature: 25,
          roomTemperature: state.environment.roomTemperature,
          heater: {
            enabled: state.equipment.heater.enabled,
            targetTemperature: state.equipment.heater.targetTemperature,
            wattage: state.equipment.heater.wattage,
          },
        })
      );
    },
    [isPlaying, stopAutoPlay, state]
  );

  const reset = useCallback(() => {
    // Stop playing if currently running
    if (isPlaying) {
      stopAutoPlay();
      setIsPlaying(false);
    }

    // Reset to initial state
    setState(
      createSimulation({
        tankCapacity: state.tank.capacity,
        initialTemperature: 25,
        roomTemperature: 22,
        heater: {
          enabled: true,
          targetTemperature: 25,
          wattage: 100,
        },
      })
    );
  }, [isPlaying, stopAutoPlay, state.tank.capacity]);

  return {
    state,
    isPlaying,
    speed,
    step,
    togglePlayPause,
    changeSpeed,
    updateHeaterEnabled,
    updateHeaterTargetTemperature,
    updateHeaterWattage,
    updateRoomTemperature,
    changeTankCapacity,
    reset,
  };
}
