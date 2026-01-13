import { useState, useCallback, useRef } from 'react';
import { produce } from 'immer';
import {
  createSimulation,
  tick as simulationTick,
  type SimulationState,
} from '../../simulation/index.js';
import { createLog } from '../../simulation/logging.js';

export type SpeedPreset = '1hr' | '6hr' | '12hr' | '1day';

const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  '1hr': 1,
  '6hr': 6,
  '12hr': 12,
  '1day': 24,
};

interface UseSimulationReturn {
  state: SimulationState;
  isPlaying: boolean;
  speed: SpeedPreset;
  step: () => void;
  togglePlayPause: () => void;
  changeSpeed: (speed: SpeedPreset) => void;
  updateHeaterEnabled: (enabled: boolean) => void;
  updateHeaterTargetTemperature: (temp: number) => void;
  updateHeaterWattage: (wattage: number) => void;
  updateRoomTemperature: (temp: number) => void;
  changeTankCapacity: (capacity: number) => void;
  reset: () => void;
}

export function useSimulation(initialCapacity = 75): UseSimulationReturn {
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
        const message = enabled
          ? `Heater enabled (target: ${draft.equipment.heater.targetTemperature}°C, ${draft.equipment.heater.wattage}W)`
          : 'Heater disabled';
        const log = createLog(draft.tick, 'user', 'info', message);
        draft.equipment.heater.enabled = enabled;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateHeaterTargetTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldTemp = draft.equipment.heater.targetTemperature;
        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Heater target: ${oldTemp}°C → ${temp}°C`
        );
        draft.equipment.heater.targetTemperature = temp;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateHeaterWattage = useCallback((wattage: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldWattage = draft.equipment.heater.wattage;
        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Heater wattage: ${oldWattage}W → ${wattage}W`
        );
        draft.equipment.heater.wattage = wattage;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateRoomTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldTemp = draft.environment.roomTemperature;
        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Room temperature: ${oldTemp}°C → ${temp}°C`
        );
        draft.environment.roomTemperature = temp;
        draft.logs.push(log);
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
      setState((current) => {
        const oldCapacity = current.tank.capacity;
        const newState = createSimulation({
          tankCapacity: capacity,
          initialTemperature: 25,
          roomTemperature: current.environment.roomTemperature,
          heater: {
            enabled: current.equipment.heater.enabled,
            targetTemperature: current.equipment.heater.targetTemperature,
            wattage: current.equipment.heater.wattage,
          },
        });
        // Add tank capacity changed log
        const log = createLog(
          0,
          'user',
          'info',
          `Tank capacity changed: ${oldCapacity}L → ${capacity}L`
        );
        return produce(newState, (draft) => {
          draft.logs.push(log);
        });
      });
    },
    [isPlaying, stopAutoPlay]
  );

  const reset = useCallback(() => {
    // Stop playing if currently running
    if (isPlaying) {
      stopAutoPlay();
      setIsPlaying(false);
    }

    // Reset to initial state
    const capacity = state.tank.capacity;
    const newState = createSimulation({
      tankCapacity: capacity,
      initialTemperature: 25,
      roomTemperature: 22,
      heater: {
        enabled: true,
        targetTemperature: 25,
        wattage: 100,
      },
    });
    // Add simulation reset log
    const log = createLog(0, 'simulation', 'info', `Simulation reset to ${capacity}L tank`);
    setState(
      produce(newState, (draft) => {
        draft.logs.push(log);
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
