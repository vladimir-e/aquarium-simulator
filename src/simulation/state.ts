/**
 * Simulation state types and factory functions.
 */

import { createLog, type LogEntry, type LogSeverity } from './core/logging.js';
import type { DailySchedule } from './core/schedule.js';
import type { FilterType, Filter } from './equipment/filter.js';
import { DEFAULT_FILTER, getFilterSurface, getFilterFlow } from './equipment/filter.js';
import type { PowerheadFlowRate, Powerhead } from './equipment/powerhead.js';
import { DEFAULT_POWERHEAD, getPowerheadFlow } from './equipment/powerhead.js';
import type { SubstrateType, Substrate } from './equipment/substrate.js';
import { DEFAULT_SUBSTRATE, getSubstrateSurface } from './equipment/substrate.js';
import { calculateHardscapeTotalSurface } from './equipment/hardscape.js';

export type { LogEntry, LogSeverity };
export type { FilterType, Filter, PowerheadFlowRate, Powerhead, SubstrateType, Substrate };

export interface Tank {
  /** Maximum water capacity in liters */
  capacity: number;
  /** Current water volume in liters */
  waterLevel: number;
  /** Bacteria surface area from glass walls (cm²) */
  bacteriaSurface: number;
  /** Maximum hardscape items allowed (2 per gallon, max 8) */
  hardscapeSlots: number;
}

/** Passive resources calculated from equipment each tick */
export interface PassiveResources {
  /** Total bacteria surface area from all equipment (cm²) */
  surface: number;
  /** Total water flow from all equipment (L/h) */
  flow: number;
  /** Light intensity in watts (0 when lights off) */
  light: number;
}

export interface Resources {
  /** Water temperature in °C */
  temperature: number;
  /** Food available for consumption (grams, 2 decimal precision) */
  food: number;
  /** Organic waste accumulation (grams) */
  waste: number;
  /** Algae level (0-100 scale, relative coverage) */
  algae: number;
  /** Ammonia in grams (convert to ppm for display: ppm = grams / liters * 1000) */
  ammonia: number;
  /** Nitrite in grams (convert to ppm for display: ppm = grams / liters * 1000) */
  nitrite: number;
  /** Nitrate in grams (convert to ppm for display: ppm = grams / liters * 1000) */
  nitrate: number;
  /** AOB (Ammonia-Oxidizing Bacteria) population as absolute unit count */
  aob: number;
  /** NOB (Nitrite-Oxidizing Bacteria) population as absolute unit count */
  nob: number;
}

export interface Environment {
  /** Room/ambient temperature in °C */
  roomTemperature: number;
  /** Ambient waste production rate (g/hour) - very small, seeds bacteria */
  ambientWaste: number;
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

export type HardscapeType = 'neutral_rock' | 'calcite_rock' | 'driftwood' | 'plastic_decoration';

export interface HardscapeItem {
  /** Unique ID for this item (for add/remove operations) */
  id: string;
  /** Type determines surface area and pH effect (future) */
  type: HardscapeType;
}

export interface Hardscape {
  /** Array of hardscape items in the tank */
  items: HardscapeItem[];
}

export interface Light {
  /** Whether light fixture is installed/enabled */
  enabled: boolean;
  /** Light power output in watts */
  wattage: number;
  /** Photoperiod schedule (start hour + duration) */
  schedule: DailySchedule;
}

export interface Equipment {
  /** Heater is always present, `enabled` property controls if active */
  heater: Heater;
  /** Lid is always present, type selectable */
  lid: Lid;
  /** ATO is always present, disabled by default */
  ato: AutoTopOff;
  /** Filter for biological filtration and flow */
  filter: Filter;
  /** Powerhead for additional water circulation */
  powerhead: Powerhead;
  /** Substrate for bacteria colonization */
  substrate: Substrate;
  /** Hardscape items (rocks, driftwood, decorations) */
  hardscape: Hardscape;
  /** Light fixture with photoperiod schedule */
  light: Light;
}

/**
 * Tracks which alert conditions are currently active.
 * Used to only fire alerts once when crossing thresholds.
 */
export interface AlertState {
  /** Water level is below critical threshold */
  waterLevelCritical: boolean;
  /** Algae level is at 80+ (bloom warning) */
  highAlgae: boolean;
  /** Ammonia level is above stress threshold (>0.02 ppm) */
  highAmmonia: boolean;
  /** Nitrite level is above stress threshold (>0.1 ppm) */
  highNitrite: boolean;
  /** Nitrate level is above action threshold (>20 ppm) */
  highNitrate: boolean;
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
  /** Passive resources calculated from equipment */
  passiveResources: PassiveResources;
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
  /** Initial filter configuration */
  filter?: Partial<Filter>;
  /** Initial powerhead configuration */
  powerhead?: Partial<Powerhead>;
  /** Initial substrate configuration */
  substrate?: Partial<Substrate>;
  /** Initial hardscape configuration */
  hardscape?: Partial<Hardscape>;
  /** Initial light configuration */
  light?: Partial<Light>;
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

export const DEFAULT_HARDSCAPE: Hardscape = {
  items: [],
};

export const DEFAULT_LIGHT: Light = {
  enabled: true,
  wattage: 100, // 100W default
  schedule: {
    startHour: 8, // 8am
    duration: 10, // 10 hours (8am-6pm)
  },
};

/**
 * Calculates available hardscape slots based on tank capacity.
 * 2 slots per gallon, max 8 slots.
 */
export function calculateHardscapeSlots(capacityLiters: number): number {
  const gallons = capacityLiters / 3.785;
  const slots = Math.floor(gallons * 2);
  return Math.min(slots, 8);
}

/**
 * Calculates tank bacteria surface area from capacity.
 * Assumes standard rectangular shape (length:width:height ≈ 2:1:1).
 * Includes 4 walls + bottom (excludes top which is open).
 */
export function calculateTankBacteriaSurface(capacity: number): number {
  // Approximation: 4 walls + bottom
  // Assuming standard proportions (length:width:height ≈ 2:1:1)
  const volume = capacity; // liters = dm³
  const height = Math.cbrt(volume / 2); // dm
  const width = height;
  const length = 2 * height;

  // Surface area: 2*(length*height) + 2*(width*height) + (length*width)
  const surfaceDm2 = 2 * (length * height) + 2 * (width * height) + length * width;
  return Math.round(surfaceDm2 * 100); // convert dm² to cm²
}

/**
 * Creates a new simulation state with the given configuration.
 */
export function createSimulation(config: SimulationConfig): SimulationState {
  const {
    tankCapacity,
    initialTemperature,
    roomTemperature,
    heater,
    lid,
    ato,
    filter,
    powerhead,
    substrate,
    hardscape,
    light,
  } = config;

  const heaterConfig: Heater = {
    ...DEFAULT_HEATER,
    ...heater,
  };

  const lidConfig: Lid = {
    ...DEFAULT_LID,
    ...lid,
  };

  const atoConfig: AutoTopOff = {
    ...DEFAULT_ATO,
    ...ato,
  };

  const filterConfig: Filter = {
    ...DEFAULT_FILTER,
    ...filter,
  };

  const powerheadConfig: Powerhead = {
    ...DEFAULT_POWERHEAD,
    ...powerhead,
  };

  const substrateConfig: Substrate = {
    ...DEFAULT_SUBSTRATE,
    ...substrate,
  };

  const hardscapeConfig: Hardscape = {
    ...DEFAULT_HARDSCAPE,
    ...hardscape,
  };

  const lightConfig: Light = {
    ...DEFAULT_LIGHT,
    ...light,
    schedule: {
      ...DEFAULT_LIGHT.schedule,
      ...light?.schedule,
    },
  };

  const effectiveRoomTemp = roomTemperature ?? DEFAULT_ROOM_TEMPERATURE;
  const heaterStatus = heaterConfig.enabled ? 'enabled' : 'disabled';

  const initialLog = createLog(
    0,
    'simulation',
    'info',
    `Simulation created: ${tankCapacity}L tank, ${effectiveRoomTemp}°C room, heater ${heaterStatus}`
  );

  // Calculate tank bacteria surface from capacity
  const tankBacteriaSurface = calculateTankBacteriaSurface(tankCapacity);

  // Calculate hardscape slots from capacity
  const hardscapeSlots = calculateHardscapeSlots(tankCapacity);

  // Calculate initial passive resources
  const initialPassiveResources = calculateInitialPassiveResources(
    tankBacteriaSurface,
    tankCapacity,
    filterConfig,
    powerheadConfig,
    substrateConfig,
    hardscapeConfig
  );

  return {
    tick: 0,
    tank: {
      capacity: tankCapacity,
      waterLevel: tankCapacity,
      bacteriaSurface: tankBacteriaSurface,
      hardscapeSlots,
    },
    resources: {
      temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
      food: 0.0,
      waste: 0.0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      aob: 0.0001, // Small seed population (absolute units)
      nob: 0.00005, // Smaller seed population (absolute units)
    },
    environment: {
      roomTemperature: effectiveRoomTemp,
      ambientWaste: 0.001, // 0.001 g/hour - very slow, just seeds bacteria
    },
    equipment: {
      heater: heaterConfig,
      lid: lidConfig,
      ato: atoConfig,
      filter: filterConfig,
      powerhead: powerheadConfig,
      substrate: substrateConfig,
      hardscape: hardscapeConfig,
      light: lightConfig,
    },
    passiveResources: initialPassiveResources,
    logs: [initialLog],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
    },
  };
}

/** Hardscape bacteria surface area by type (cm²) */
export const HARDSCAPE_SURFACE: Record<HardscapeType, number> = {
  neutral_rock: 400,
  calcite_rock: 400,
  driftwood: 650,
  plastic_decoration: 100,
};

/**
 * Calculates initial passive resources from equipment configuration.
 */
function calculateInitialPassiveResources(
  tankBacteriaSurface: number,
  tankCapacity: number,
  filter: Filter,
  powerhead: Powerhead,
  substrate: Substrate,
  hardscape: Hardscape
): PassiveResources {
  // Surface area
  let surface = tankBacteriaSurface;
  if (filter.enabled) {
    surface += getFilterSurface(filter.type);
  }
  surface += getSubstrateSurface(substrate.type, tankCapacity);
  surface += calculateHardscapeTotalSurface(hardscape.items);

  // Flow rate
  let flow = 0;
  if (filter.enabled) {
    flow += getFilterFlow(filter.type);
  }
  if (powerhead.enabled) {
    flow += getPowerheadFlow(powerhead.flowRateGPH);
  }

  // Light is calculated based on schedule each tick - starts at 0
  // Will be properly calculated by calculatePassiveResources based on tick
  return { surface, flow, light: 0 };
}
