import { useState, useCallback, useRef, useEffect } from 'react';
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
import { usePersistence, type PersistedSimulation } from '../persistence/index.js';

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
  /** True if equipment or plants have been modified from preset defaults */
  isPresetModified: boolean;
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
  updateAutoDoserEnabled: (enabled: boolean) => void;
  updateAutoDoserAmount: (amountMl: number) => void;
  updateAutoDoserSchedule: (schedule: DailySchedule) => void;
  changeTankCapacity: (capacity: number) => void;
  reset: () => void;
  executeAction: (action: Action) => void;
}

export { type PresetId, PRESETS };

/**
 * Convert persisted simulation state to full SimulationState.
 * Logs are always reset to empty on load (ephemeral).
 */
function persistedToState(persisted: PersistedSimulation): SimulationState {
  return {
    ...persisted,
    logs: [], // Logs are NOT persisted
  };
}

/**
 * Convert SimulationState to persisted simulation (excludes logs).
 */
function stateToPersistedSimulation(
  state: SimulationState,
  currentPreset: PresetId
): PersistedSimulation {
  return {
    tick: state.tick,
    tank: state.tank,
    resources: state.resources,
    environment: state.environment,
    equipment: state.equipment,
    plants: state.plants,
    alertState: state.alertState,
    currentPreset,
  };
}

/**
 * Create initial resources for a fresh simulation reset.
 * Uses tank capacity to set water level.
 */
function createInitialResources(
  tankCapacity: number,
  environment: SimulationState['environment'],
  equipment: SimulationState['equipment']
): SimulationState['resources'] {
  // Create a temporary simulation to get initial resource values
  const tempState = createSimulation({
    tankCapacity,
    roomTemperature: environment.roomTemperature,
    tapWaterTemperature: environment.tapWaterTemperature,
    tapWaterPH: environment.tapWaterPH,
  });

  // Now calculate passive resources based on current equipment
  const fullState: SimulationState = {
    ...tempState,
    equipment,
  };
  const passiveValues = calculatePassiveResources(fullState);

  return {
    ...tempState.resources,
    surface: passiveValues.surface,
    flow: passiveValues.flow,
    light: passiveValues.light,
    aeration: passiveValues.aeration,
  };
}

export function useSimulation(initialPreset: PresetId = DEFAULT_PRESET_ID): UseSimulationReturn {
  const { config } = useConfig();
  const { initialSimulation, onSimulationChange } = usePersistence();

  // Restore preset from persistence or use default
  const [currentPreset, setCurrentPreset] = useState<PresetId>(() => {
    if (initialSimulation?.currentPreset) {
      // Validate it's a known preset ID
      const preset = getPresetById(initialSimulation.currentPreset as PresetId);
      if (preset) {
        return initialSimulation.currentPreset as PresetId;
      }
    }
    return initialPreset;
  });

  // Track if equipment/plants have been modified from preset defaults
  const [isModified, setIsModified] = useState(false);

  const [state, setState] = useState<SimulationState>(() => {
    // If we have persisted state, restore it
    if (initialSimulation) {
      const restoredState = persistedToState(initialSimulation);
      // Add a log entry for session resume
      const log = createLog(restoredState.tick, 'simulation', 'info', 'Session restored');
      return produce(restoredState, (draft) => {
        draft.logs.push(log);
      });
    }

    // Otherwise, create from default preset
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

  // Notify persistence when state or preset changes
  useEffect(() => {
    onSimulationChange(stateToPersistedSimulation(state, currentPreset));
  }, [state, currentPreset, onSimulationChange]);

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
      setIsModified(false);

      // Apply preset equipment while preserving simulation progress
      setState((current) =>
        produce(current, (draft) => {
          // Create a fresh state from preset to get equipment defaults
          const presetState = createSimulation(preset.config);

          // Scale water level if tank capacity changes
          const oldCapacity = current.tank.capacity;
          const newCapacity = presetState.tank.capacity;
          if (oldCapacity !== newCapacity) {
            const fillRatio = current.resources.water / oldCapacity;
            draft.resources.water = Math.min(fillRatio * newCapacity, newCapacity);
          }

          // Apply tank and equipment from preset
          draft.tank = presetState.tank;
          draft.equipment = presetState.equipment;
          draft.environment = presetState.environment;

          // Recalculate passive resources
          const passiveValues = calculatePassiveResources(draft as SimulationState);
          draft.resources.surface = passiveValues.surface;
          draft.resources.flow = passiveValues.flow;
          draft.resources.light = passiveValues.light;
          draft.resources.aeration = passiveValues.aeration;

          // Log the change
          const log = createLog(draft.tick, 'simulation', 'info', `Switched to preset: ${preset.name}`);
          draft.logs.push(log);
        })
      );
    },
    [isPlaying, stopAutoPlay]
  );

  /**
   * Reset simulation: keeps equipment and plants but resets
   * tick, resources, alertState, and logs to fresh state.
   */
  const reset = useCallback(() => {
    // Stop playing if currently running
    if (isPlaying) {
      stopAutoPlay();
      setIsPlaying(false);
    }

    setState((current) =>
      produce(current, (draft) => {
        // Reset tick to 0
        draft.tick = 0;

        // Reset resources to initial values for current tank
        const freshResources = createInitialResources(
          current.tank.capacity,
          current.environment,
          current.equipment
        );
        draft.resources = freshResources;

        // Reset alert state
        draft.alertState = {
          waterLevelCritical: false,
          highAlgae: false,
          highAmmonia: false,
          highNitrite: false,
          highNitrate: false,
          lowOxygen: false,
          highCo2: false,
        };

        // Clear logs and add reset message
        draft.logs = [createLog(0, 'simulation', 'info', 'Simulation reset')];
      })
    );
  }, [isPlaying, stopAutoPlay]);

  const updateHeaterEnabled = useCallback((enabled: boolean) => {
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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
    setIsModified(true);
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

  const updateAutoDoserEnabled = useCallback((enabled: boolean) => {
    setIsModified(true);
    setState((current) =>
      produce(current, (draft) => {
        const message = enabled
          ? `Auto doser enabled (${draft.equipment.autoDoser.doseAmountMl}ml at ${draft.equipment.autoDoser.schedule.startHour}:00)`
          : 'Auto doser disabled';
        const log = createLog(draft.tick, 'user', 'info', message);
        draft.equipment.autoDoser.enabled = enabled;
        draft.logs.push(log);
      })
    );
  }, []);

  const updateAutoDoserAmount = useCallback((amountMl: number) => {
    setIsModified(true);
    setState((current) =>
      produce(current, (draft) => {
        const oldAmount = draft.equipment.autoDoser.doseAmountMl;
        if (oldAmount !== amountMl) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `Auto doser amount: ${oldAmount}ml → ${amountMl}ml`
          );
          draft.equipment.autoDoser.doseAmountMl = amountMl;
          draft.logs.push(log);
        }
      })
    );
  }, []);

  const updateAutoDoserSchedule = useCallback((schedule: DailySchedule) => {
    setIsModified(true);
    setState((current) =>
      produce(current, (draft) => {
        const oldSchedule = draft.equipment.autoDoser.schedule;
        if (oldSchedule.startHour !== schedule.startHour) {
          const log = createLog(
            draft.tick,
            'user',
            'info',
            `Auto doser time: ${oldSchedule.startHour}:00 → ${schedule.startHour}:00`
          );
          draft.equipment.autoDoser.schedule = schedule;
          draft.logs.push(log);
        }
      })
    );
  }, []);

  const changeTankCapacity = useCallback(
    (capacity: number) => {
      setIsModified(true);
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
          autoDoser: {
            enabled: current.equipment.autoDoser.enabled,
            doseAmountMl: current.equipment.autoDoser.doseAmountMl,
            schedule: current.equipment.autoDoser.schedule,
          },
        });
      });
    },
    [isPlaying, stopAutoPlay]
  );

  /**
   * Execute a user action immediately (works even when paused).
   */
  const executeAction = useCallback((action: Action) => {
    // Mark as modified for plant actions
    if (action.type === 'addPlant' || action.type === 'removePlant') {
      setIsModified(true);
    }
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
    isPresetModified: isModified,
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
    updateAutoDoserEnabled,
    updateAutoDoserAmount,
    updateAutoDoserSchedule,
    changeTankCapacity,
    reset,
    executeAction,
  };
}
