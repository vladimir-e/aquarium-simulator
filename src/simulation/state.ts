/**
 * Simulation state types and factory functions.
 */

import { createLog, type LogEntry, type LogSeverity } from './logging.js';

export type { LogEntry, LogSeverity };

export interface Tank {
  /** Maximum water capacity in liters */
  capacity: number;
  /** Current water volume in liters */
  waterLevel: number;
}

export interface Resources {
  /** Water temperature in °C */
  temperature: number;
}

export interface Environment {
  /** Room/ambient temperature in °C */
  roomTemperature: number;
}

export interface Heater {
  /** Whether the heater is installed/mounted to tank */
  enabled: boolean;
  /** Currently heating (system-controlled each tick) */
  isOn: boolean;
  /** Target temperature in °C */
  targetTemperature: number;
  /** Heater power in watts (affects heating rate) */
  wattage: number;
}

export type LidType = 'none' | 'mesh' | 'full' | 'sealed';

export interface Lid {
  /** Lid type affects evaporation rate */
  type: LidType;
}

export interface AutoTopOff {
  /** Whether ATO is enabled */
  enabled: boolean;
}

export interface Equipment {
  /** Heater is always present, `enabled` property controls if active */
  heater: Heater;
  /** Lid is always present, type selectable */
  lid: Lid;
  /** ATO is always present, disabled by default */
  ato: AutoTopOff;
}

/**
 * Tracks which alert conditions are currently active.
 * Used to only fire alerts once when crossing thresholds.
 */
export interface AlertState {
  /** Water level is below critical threshold */
  waterLevelCritical: boolean;
}

export interface SimulationState {
  /** Current simulation tick (1 tick = 1 hour) */
  tick: number;
  /** Tank physical properties */
  tank: Tank;
  /** Resource values */
  resources: Resources;
  /** External environment conditions */
  environment: Environment;
  /** Tank equipment */
  equipment: Equipment;
  /** In-memory log storage */
  logs: LogEntry[];
  /** Tracks active alert conditions for threshold-crossing detection */
  alertState: AlertState;
}

export interface SimulationConfig {
  /** Tank capacity in liters */
  tankCapacity: number;
  /** Initial temperature in °C (defaults to 25) */
  initialTemperature?: number;
  /** Room temperature in °C (defaults to 22) */
  roomTemperature?: number;
  /** Initial heater configuration */
  heater?: Partial<Heater>;
  /** Initial lid configuration */
  lid?: Partial<Lid>;
  /** Initial ATO configuration */
  ato?: Partial<AutoTopOff>;
}

const DEFAULT_TEMPERATURE = 25;
const DEFAULT_ROOM_TEMPERATURE = 22;

export const DEFAULT_HEATER: Heater = {
  enabled: true,
  isOn: false,
  targetTemperature: 25,
  wattage: 100,
};

export const DEFAULT_LID: Lid = {
  type: 'none',
};

export const DEFAULT_ATO: AutoTopOff = {
  enabled: false,
};

/**
 * Creates a new simulation state with the given configuration.
 */
export function createSimulation(config: SimulationConfig): SimulationState {
  const { tankCapacity, initialTemperature, roomTemperature, heater, lid, ato } = config;

  const heaterConfig = {
    ...DEFAULT_HEATER,
    ...heater,
  };

  const lidConfig = {
    ...DEFAULT_LID,
    ...lid,
  };

  const atoConfig = {
    ...DEFAULT_ATO,
    ...ato,
  };

  const effectiveRoomTemp = roomTemperature ?? DEFAULT_ROOM_TEMPERATURE;
  const heaterStatus = heaterConfig.enabled ? 'enabled' : 'disabled';

  const initialLog = createLog(
    0,
    'simulation',
    'info',
    `Simulation created: ${tankCapacity}L tank, ${effectiveRoomTemp}°C room, heater ${heaterStatus}`
  );

  return {
    tick: 0,
    tank: {
      capacity: tankCapacity,
      waterLevel: tankCapacity,
    },
    resources: {
      temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
    },
    environment: {
      roomTemperature: effectiveRoomTemp,
    },
    equipment: {
      heater: heaterConfig,
      lid: lidConfig,
      ato: atoConfig,
    },
    logs: [initialLog],
    alertState: {
      waterLevelCritical: false,
    },
  };
}
