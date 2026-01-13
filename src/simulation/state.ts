/**
 * Simulation state types and factory functions.
 */

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

export interface Equipment {
  /** Heater is always present, `enabled` property controls if active */
  heater: Heater;
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
}

const DEFAULT_TEMPERATURE = 25;
const DEFAULT_ROOM_TEMPERATURE = 22;

export const DEFAULT_HEATER: Heater = {
  enabled: true,
  isOn: false,
  targetTemperature: 25,
  wattage: 100,
};

/**
 * Creates a new simulation state with the given configuration.
 */
export function createSimulation(config: SimulationConfig): SimulationState {
  const { tankCapacity, initialTemperature, roomTemperature, heater } = config;

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
      roomTemperature: roomTemperature ?? DEFAULT_ROOM_TEMPERATURE,
    },
    equipment: {
      heater: {
        ...DEFAULT_HEATER,
        ...heater,
      },
    },
  };
}
