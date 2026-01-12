import { useState, useCallback, useRef, useEffect } from 'react';
import { produce } from 'immer';
import {
  createSimulation,
  tick as simulationTick,
  type SimulationState,
} from '@/simulation';
import type { SpeedPreset } from '../components/layout/Timeline';

const DEFAULT_CONFIG = {
  tankCapacity: 75,
  initialTemperature: 25,
  roomTemperature: 22,
  heater: {
    enabled: true,
    targetTemperature: 25,
    wattage: 100,
  },
};

// Speed presets in ticks per second
const SPEED_MAP: Record<SpeedPreset, number> = {
  '1hr/s': 1,
  '6hr/s': 6,
  '12hr/s': 12,
  '1day/s': 24,
};

export interface UseSimulationReturn {
  state: SimulationState;
  isPlaying: boolean;
  speed: SpeedPreset;
  step: () => void;
  stepMultiple: (count: number) => void;
  togglePlay: () => void;
  setSpeed: (speed: SpeedPreset) => void;
  setRoomTemperature: (temp: number) => void;
  setHeaterEnabled: (enabled: boolean) => void;
  setHeaterTargetTemp: (temp: number) => void;
  setHeaterWattage: (wattage: number) => void;
  setTankCapacity: (capacity: number) => void;
}

export function useSimulation(): UseSimulationReturn {
  const [state, setState] = useState<SimulationState>(() =>
    createSimulation(DEFAULT_CONFIG)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedPreset>('6hr/s');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Single tick advance
  const step = useCallback(() => {
    setState((current) => simulationTick(current));
  }, []);

  // Multiple ticks at once
  const stepMultiple = useCallback((count: number) => {
    setState((current) => {
      let newState = current;
      for (let i = 0; i < count; i++) {
        newState = simulationTick(newState);
      }
      return newState;
    });
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Handle auto-advance when playing
  useEffect(() => {
    if (isPlaying) {
      const ticksPerSecond = SPEED_MAP[speed];
      const intervalMs = 1000 / ticksPerSecond;

      intervalRef.current = setInterval(() => {
        setState((current) => simulationTick(current));
      }, intervalMs);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed]);

  // Set room temperature
  const setRoomTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.environment.roomTemperature = temp;
      })
    );
  }, []);

  // Heater controls
  const setHeaterEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.enabled = enabled;
      })
    );
  }, []);

  const setHeaterTargetTemp = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.targetTemperature = temp;
      })
    );
  }, []);

  const setHeaterWattage = useCallback((wattage: number) => {
    setState((current) =>
      produce(current, (draft) => {
        draft.equipment.heater.wattage = wattage;
      })
    );
  }, []);

  // Tank capacity change (resets simulation)
  const setTankCapacity = useCallback((capacity: number) => {
    setState(
      createSimulation({
        ...DEFAULT_CONFIG,
        tankCapacity: capacity,
      })
    );
  }, []);

  return {
    state,
    isPlaying,
    speed,
    step,
    stepMultiple,
    togglePlay,
    setSpeed,
    setRoomTemperature,
    setHeaterEnabled,
    setHeaterTargetTemp,
    setHeaterWattage,
    setTankCapacity,
  };
}
