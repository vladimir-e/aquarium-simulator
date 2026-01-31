import { useState, useCallback, useRef } from 'react';
import { produce } from 'immer';
import {
  createSimulation,
  tick as simulationTick,
  applyAction,
  calculatePassiveResources,
  calculateHardscapeSlots,
  getHardscapeName,
  formatSchedule,
  type SimulationState,
  type Action,
  type LidType,
  type FilterType,
  type PowerheadFlowRate,
  type SubstrateType,
  type HardscapeType,
  type HardscapeItem,
  type DailySchedule,
} from '../../simulation/index.js';
import { createLog } from '../../simulation/core/logging.js';
import { PRESETS, DEFAULT_PRESET_ID, getPresetById, type PresetId } from '../presets.js';
import { useConfig } from './useConfig.js';

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
  currentPreset: PresetId;
  step: () => void;
  togglePlayPause: () => void;
  changeSpeed: (speed: SpeedPreset) => void;
  loadPreset: (presetId: PresetId) => void;
  updateHeaterEnabled: (enabled: boolean) => void;
  updateHeaterTargetTemperature: (temp: number) => void;
  updateHeaterWattage: (wattage: number) => void;
  updateRoomTemperature: (temp: number) => void;
  updateTapWaterTemperature: (temp: number) => void;
  updateTapWaterPH: (ph: number) => void;
  updateLidType: (type: LidType) => void;
  updateAtoEnabled: (enabled: boolean) => void;
  updateFilterEnabled: (enabled: boolean) => void;
  updateFilterType: (type: FilterType) => void;
  updateAirPumpEnabled: (enabled: boolean) => void;
  updatePowerheadEnabled: (enabled: boolean) => void;
  updatePowerheadFlowRate: (flowRateGPH: PowerheadFlowRate) => void;
  updateSubstrateType: (type: SubstrateType) => void;
  addHardscapeItem: (type: HardscapeType) => void;
  removeHardscapeItem: (id: string) => void;
  updateLightEnabled: (enabled: boolean) => void;
  updateLightWattage: (wattage: number) => void;
  updateLightSchedule: (schedule: DailySchedule) => void;
  updateCo2GeneratorEnabled: (enabled: boolean) => void;
  updateCo2GeneratorBubbleRate: (bubbleRate: number) => void;
  updateCo2GeneratorSchedule: (schedule: DailySchedule) => void;
  changeTankCapacity: (capacity: number) => void;
  reset: () => void;
  executeAction: (action: Action) => void;
}

export { type PresetId, PRESETS };

export function useSimulation(initialPreset: PresetId = DEFAULT_PRESET_ID): UseSimulationReturn {
  const { config } = useConfig();
  const [currentPreset, setCurrentPreset] = useState<PresetId>(initialPreset);
  const [state, setState] = useState<SimulationState>(() => {
    const preset = getPresetById(initialPreset);
    if (!preset) {
      throw new Error(`Unknown preset: ${initialPreset}`);
    }
    return createSimulation(preset.config);
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedPreset>('1hr');
  const intervalRef = useRef<number | null>(null);
  // Store config ref for use in intervals
  const configRef = useRef(config);
  configRef.current = config;

  const step = useCallback(() => {
    const multiplier = SPEED_MULTIPLIERS[speed];
    setState((current) => {
      let nextState = current;
      for (let i = 0; i < multiplier; i++) {
        nextState = simulationTick(nextState, configRef.current);
      }
      return nextState;
    });
  }, [speed]);

  const startAutoPlay = useCallback(() => {
    if (intervalRef.current) return;

    const ticksPerSecond = SPEED_MULTIPLIERS[speed];
    const intervalMs = 1000 / ticksPerSecond;

    intervalRef.current = window.setInterval(() => {
      setState((current) => simulationTick(current, configRef.current));
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
          setState((current) => simulationTick(current, configRef.current));
        }, intervalMs);
      }
    },
    [isPlaying, stopAutoPlay]
  );

  const loadPreset = useCallback(
    (presetId: PresetId) => {
      const preset = getPresetById(presetId);
      if (!preset) {
        return;
      }

      // Stop playing if currently running
      if (isPlaying) {
        stopAutoPlay();
        setIsPlaying(false);
      }

      setCurrentPreset(presetId);
      const newState = createSimulation(preset.config);
      const log = createLog(0, 'simulation', 'info', `Loaded preset: ${preset.name}`);
      setState(
        produce(newState, (draft) => {
          draft.logs.push(log);
        })
      );
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

  const updateTapWaterTemperature = useCallback((temp: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldTemp = draft.environment.tapWaterTemperature;
        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Tap water temperature: ${oldTemp}°C → ${temp}°C`
        );
        draft.environment.tapWaterTemperature = temp;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateTapWaterPH = useCallback((ph: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldPH = draft.environment.tapWaterPH;
        const log = createLog(
          draft.tick,
          'user',
          'info',
          `Tap water pH: ${oldPH.toFixed(1)} → ${ph.toFixed(1)}`
        );
        draft.environment.tapWaterPH = ph;
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
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
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
          const passiveValues = calculatePassiveResources(draft);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
          draft.resources.aeration = passiveValues.aeration;
        }
      })
    );
  }, []);

  const updateAirPumpEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled ? 'Air pump enabled' : 'Air pump disabled';
        const log = createLog(draft.tick, 'equipment', 'info', message);
        draft.equipment.airPump.enabled = enabled;
        draft.logs.push(log);
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
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
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
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
          const passiveValues = calculatePassiveResources(draft);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
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
          const passiveValues = calculatePassiveResources(draft);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
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
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
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
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
      })
    );
  }, []);

  const updateLightEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled
          ? `Light enabled (${draft.equipment.light.wattage}W)`
          : 'Light disabled';
        const log = createLog(draft.tick, 'user', 'info', message);
        draft.equipment.light.enabled = enabled;
        draft.logs.push(log);
        const passiveValues = calculatePassiveResources(draft);
        draft.resources.surface = passiveValues.surface;
        draft.resources.flow = passiveValues.flow;
        draft.resources.light = passiveValues.light;
        draft.resources.aeration = passiveValues.aeration;
      })
    );
  }, []);

  const updateLightWattage = useCallback((wattage: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldWattage = draft.equipment.light.wattage;
        if (oldWattage !== wattage) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `Light wattage: ${oldWattage}W → ${wattage}W`
          );
          draft.equipment.light.wattage = wattage;
          draft.logs.push(log);
          const passiveValues = calculatePassiveResources(draft);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
        }
      })
    );
  }, []);

  const updateLightSchedule = useCallback((schedule: DailySchedule) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldSchedule = draft.equipment.light.schedule;
        if (oldSchedule.startHour !== schedule.startHour || oldSchedule.duration !== schedule.duration) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `Light schedule: ${formatSchedule(schedule)}`
          );
          draft.equipment.light.schedule = schedule;
          draft.logs.push(log);
          const passiveValues = calculatePassiveResources(draft);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
        }
      })
    );
  }, []);

  const updateCo2GeneratorEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled
          ? `CO2 generator enabled (${draft.equipment.co2Generator.bubbleRate} bps)`
          : 'CO2 generator disabled';
        const log = createLog(draft.tick, 'user', 'info', message);
        draft.equipment.co2Generator.enabled = enabled;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateCo2GeneratorBubbleRate = useCallback((bubbleRate: number) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldRate = draft.equipment.co2Generator.bubbleRate;
        if (oldRate !== bubbleRate) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `CO2 bubble rate: ${oldRate} bps → ${bubbleRate} bps`
          );
          draft.equipment.co2Generator.bubbleRate = bubbleRate;
          draft.logs.push(log);
        }
      })
    );
  }, []);

  const updateCo2GeneratorSchedule = useCallback((schedule: DailySchedule) => {
    setState((current) =>
      produce(current, (draft) => {
        const oldSchedule = draft.equipment.co2Generator.schedule;
        if (oldSchedule.startHour !== schedule.startHour || oldSchedule.duration !== schedule.duration) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `CO2 schedule: ${formatSchedule(schedule)}`
          );
          draft.equipment.co2Generator.schedule = schedule;
          draft.logs.push(log);
        }
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
          light: {
            enabled: current.equipment.light.enabled,
            wattage: current.equipment.light.wattage,
            schedule: current.equipment.light.schedule,
          },
          co2Generator: {
            enabled: current.equipment.co2Generator.enabled,
            bubbleRate: current.equipment.co2Generator.bubbleRate,
            schedule: current.equipment.co2Generator.schedule,
          },
          airPump: {
            enabled: current.equipment.airPump.enabled,
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

    // Reset to current preset's initial state
    const preset = getPresetById(currentPreset);
    if (!preset) {
      return;
    }

    const newState = createSimulation(preset.config);
    const log = createLog(0, 'simulation', 'info', `Reset to preset: ${preset.name}`);
    setState(
      produce(newState, (draft) => {
        draft.logs.push(log);
      })
    );
  }, [isPlaying, stopAutoPlay, currentPreset]);

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
    currentPreset,
    step,
    togglePlayPause,
    changeSpeed,
    loadPreset,
    updateHeaterEnabled,
    updateHeaterTargetTemperature,
    updateHeaterWattage,
    updateRoomTemperature,
    updateTapWaterTemperature,
    updateTapWaterPH,
    updateLidType,
    updateAtoEnabled,
    updateFilterEnabled,
    updateFilterType,
    updateAirPumpEnabled,
    updatePowerheadEnabled,
    updatePowerheadFlowRate,
    updateSubstrateType,
    addHardscapeItem,
    removeHardscapeItem,
    updateLightEnabled,
    updateLightWattage,
    updateLightSchedule,
    updateCo2GeneratorEnabled,
    updateCo2GeneratorBubbleRate,
    updateCo2GeneratorSchedule,
    changeTankCapacity,
    reset,
    executeAction,
  };
}
