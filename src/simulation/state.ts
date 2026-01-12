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

export interface SimulationState {
  /** Current simulation tick (1 tick = 1 hour) */
  tick: number;
  /** Tank physical properties */
  tank: Tank;
  /** Resource values */
  resources: Resources;
}

export interface SimulationConfig {
  /** Tank capacity in liters */
  tankCapacity: number;
  /** Initial water level in liters (defaults to capacity) */
  initialWaterLevel?: number;
  /** Initial temperature in °C (defaults to 25) */
  initialTemperature?: number;
}

const DEFAULT_TEMPERATURE = 25;

/**
 * Creates a new simulation state with the given configuration.
 */
export function createSimulation(config: SimulationConfig): SimulationState {
  const { tankCapacity, initialWaterLevel, initialTemperature } = config;

  return {
    tick: 0,
    tank: {
      capacity: tankCapacity,
      waterLevel: initialWaterLevel ?? tankCapacity,
    },
    resources: {
      temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
    },
  };
}
