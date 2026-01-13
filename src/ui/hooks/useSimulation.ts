import { useState, useCallback, useRef } from 'react';
import { produce } from 'immer';
import {
  createSimulation,
  tick as simulationTick,
  applyAction,
  calculatePassiveResources,
  calculateHardscapeSlots,
  getHardscapeName,
  type SimulationState,
  type Action,
  type LidType,
  type FilterType,
  type PowerheadFlowRate,
  type SubstrateType,
  type HardscapeType,
  type HardscapeItem,
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
  updateLidType: (type: LidType) => void;
  updateAtoEnabled: (enabled: boolean) => void;
  updateFilterEnabled: (enabled: boolean) => void;
  updateFilterType: (type: FilterType) => void;
  updatePowerheadEnabled: (enabled: boolean) => void;
  updatePowerheadFlowRate: (flowRateGPH: PowerheadFlowRate) => void;
  updateSubstrateType: (type: SubstrateType) => void;
  addHardscapeItem: (type: HardscapeType) => void;
  removeHardscapeItem: (id: string) => void;
  changeTankCapacity: (capacity: number) => void;
  reset: () => void;
  executeAction: (action: Action) => void;
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

  const updateLidType = useCallback((type: LidType) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldType = draft.equipment.lid.type;
        const log = createLog(
          draft.tick,
          'equipment',
          'info',
          `Lid changed to ${type}`
        );
        draft.equipment.lid.type = type;
        // Only log if type actually changed
        if (oldType !== type) {
          draft.logs.push(log);
        }
      })
    );
  }, []);

  const updateAtoEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled
          ? 'Auto Top-Off enabled'
          : 'Auto Top-Off disabled';
        const log = createLog(draft.tick, 'user', 'info', message);
        draft.equipment.ato.enabled = enabled;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateFilterEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled ? 'Filter enabled' : 'Filter disabled';
        const log = createLog(draft.tick, 'equipment', 'info', message);
        draft.equipment.filter.enabled = enabled;
        draft.logs.push(log);
        draft.passiveResources = calculatePassiveResources(draft);
      })
    );
  }, []);

  const updateFilterType = useCallback((type: FilterType) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldType = draft.equipment.filter.type;
        if (oldType !== type) {
          const log = createLog(
            draft.tick,
            'equipment',
            'info',
            `Filter changed to ${type}`
          );
          draft.equipment.filter.type = type;
          draft.logs.push(log);
          draft.passiveResources = calculatePassiveResources(draft);
        }
      })
    );
  }, []);

  const updatePowerheadEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled ? 'Powerhead enabled' : 'Powerhead disabled';
        const log = createLog(draft.tick, 'equipment', 'info', message);
        draft.equipment.powerhead.enabled = enabled;
        draft.logs.push(log);
        draft.passiveResources = calculatePassiveResources(draft);
      })
    );
  }, []);

  const updatePowerheadFlowRate = useCallback((flowRateGPH: PowerheadFlowRate) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldRate = draft.equipment.powerhead.flowRateGPH;
        if (oldRate !== flowRateGPH) {
          const log = createLog(
            draft.tick,
            'equipment',
            'info',
            `Powerhead flow rate set to ${flowRateGPH} GPH`
          );
          draft.equipment.powerhead.flowRateGPH = flowRateGPH;
          draft.logs.push(log);
          draft.passiveResources = calculatePassiveResources(draft);
        }
      })
    );
  }, []);

  const updateSubstrateType = useCallback((type: SubstrateType) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldType = draft.equipment.substrate.type;
        if (oldType !== type) {
          const log = createLog(
            draft.tick,
            'equipment',
            'info',
            `Substrate changed to ${type}`
          );
          draft.equipment.substrate.type = type;
          draft.logs.push(log);
          draft.passiveResources = calculatePassiveResources(draft);
        }
      })
    );
  }, []);

  const addHardscapeItem = useCallback((type: HardscapeType) => {
    setState((current) =>
      produce(current, (draft) => {
        // Check slot limit
        if (draft.equipment.hardscape.items.length >= draft.tank.hardscapeSlots) {
          return; // Can't add more
        }

        // Create new item with unique ID
        const newItem: HardscapeItem = {
          id: globalThis.crypto.randomUUID(),
          type,
        };

        draft.equipment.hardscape.items.push(newItem);

        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Added ${getHardscapeName(type)} hardscape`
        );
        draft.logs.push(log);
        draft.passiveResources = calculatePassiveResources(draft);
      })
    );
  }, []);

  const removeHardscapeItem = useCallback((id: string) => {
    setState((current) =>
      produce(current, (draft) => {
        const item = draft.equipment.hardscape.items.find((i) => i.id === id);
        if (!item) return;

        draft.equipment.hardscape.items = draft.equipment.hardscape.items.filter(
          (i) => i.id !== id
        );

        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Removed ${getHardscapeName(item.type)} hardscape`
        );
        draft.logs.push(log);
        draft.passiveResources = calculatePassiveResources(draft);
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

      // Reinitialize simulation with new capacity, preserving equipment state
      setState((current) => {
        // Calculate new hardscape slots for the new capacity
        // Keep existing items but truncate if the new tank has fewer slots
        const newSlots = calculateHardscapeSlots(capacity);
        const preservedItems = current.equipment.hardscape.items.slice(0, newSlots);

        return createSimulation({
          tankCapacity: capacity,
          initialTemperature: 25,
          roomTemperature: current.environment.roomTemperature,
          heater: {
            enabled: current.equipment.heater.enabled,
            targetTemperature: current.equipment.heater.targetTemperature,
            wattage: current.equipment.heater.wattage,
          },
          lid: {
            type: current.equipment.lid.type,
          },
          ato: {
            enabled: current.equipment.ato.enabled,
          },
          filter: {
            enabled: current.equipment.filter.enabled,
            type: current.equipment.filter.type,
          },
          powerhead: {
            enabled: current.equipment.powerhead.enabled,
            flowRateGPH: current.equipment.powerhead.flowRateGPH,
          },
          substrate: {
            type: current.equipment.substrate.type,
          },
          hardscape: {
            items: preservedItems,
          },
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

  /**
   * Execute a user action immediately (works even when paused).
   */
  const executeAction = useCallback((action: Action) => {
    setState((currentState) => {
      const result = applyAction(currentState, action);
      return result.state;
    });
  }, []);

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
    updateLidType,
    updateAtoEnabled,
    updateFilterEnabled,
    updateFilterType,
    updatePowerheadEnabled,
    updatePowerheadFlowRate,
    updateSubstrateType,
    addHardscapeItem,
    removeHardscapeItem,
    changeTankCapacity,
    reset,
    executeAction,
  };
}
