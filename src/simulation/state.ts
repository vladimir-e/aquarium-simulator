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
  /** Maximum hardscape items allowed (2 per gallon, max 8) */
  hardscapeSlots: number;
}

export interface Resources {
  // Physical resources
  /** Current water volume in liters (max = tank.capacity) */
  water: number;
  /** Water temperature in °C */
  temperature: number;

  // Passive resources (calculated each tick from equipment)
  /** Total bacteria surface area from all equipment (cm²) */
  surface: number;
  /** Total water flow from all equipment (L/h) */
  flow: number;
  /** Light intensity in watts (0 when lights off) */
  light: number;

  // Biological resources
  /** Food available for consumption (grams, 2 decimal precision) */
  food: number;
  /** Organic waste accumulation (grams) */
  waste: number;
  /** Algae level (0-100 scale, relative coverage) */
  algae: number;

  // Chemical resources (nitrogen cycle) - stored as mass (mg)
  // Concentration (ppm) derived as mass/water for display and threshold checks
  /** Ammonia mass in mg (toxic when ppm > 0.1, derive ppm = mass/water) */
  ammonia: number;
  /** Nitrite mass in mg (toxic when ppm > 1.0, derive ppm = mass/water) */
  nitrite: number;
  /** Nitrate mass in mg (accumulates, derive ppm = mass/water, <20 ppm safe) */
  nitrate: number;

  // Chemical resources (dissolved gases) - stored as concentration (mg/L)
  /** Dissolved oxygen in mg/L (healthy > 6, critical < 4) */
  oxygen: number;
  /** Dissolved CO2 in mg/L (atmospheric ~3-5, harmful > 30) */
  co2: number;

  // Bacteria populations (nitrogen cycle)
  /** Ammonia-oxidizing bacteria population (absolute count) */
  aob: number;
  /** Nitrite-oxidizing bacteria population (absolute count) */
  nob: number;
}

export interface Environment {
  /** Room/ambient temperature in °C */
  roomTemperature: number;
  /** Tap water temperature in °C (for water changes and ATO) */
  tapWaterTemperature: number;
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
  /** Ammonia level is above danger threshold (>0.1 ppm) */
  highAmmonia: boolean;
  /** Nitrite level is above danger threshold (>1.0 ppm) */
  highNitrite: boolean;
  /** Nitrate level is above danger threshold (>80 ppm) */
  highNitrate: boolean;
  /** Oxygen below critical threshold (< 4 mg/L) */
  lowOxygen: boolean;
  /** CO2 above harmful threshold (> 30 mg/L) */
  highCo2: boolean;
}

export interface SimulationState {
  /** Current simulation tick (1 tick = 1 hour) */
  tick: number;
  /** Tank physical properties (capacity and slots only) */
  tank: Tank;
  /** All resource values */
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
  /** Tap water temperature in °C (defaults to 20) */
  tapWaterTemperature?: number;
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
const DEFAULT_TAP_WATER_TEMPERATURE = 20;

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
export function calculateTankGlassSurface(capacity: number): number {
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
    tapWaterTemperature,
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
  const effectiveTapWaterTemp = tapWaterTemperature ?? DEFAULT_TAP_WATER_TEMPERATURE;
  const heaterStatus = heaterConfig.enabled ? 'enabled' : 'disabled';

  const initialLog = createLog(
    0,
    'simulation',
    'info',
    `Simulation created: ${tankCapacity}L tank, ${effectiveRoomTemp}°C room, heater ${heaterStatus}`
  );

  // Calculate tank glass surface from capacity (used in passive resource calculation)
  const tankGlassSurface = calculateTankGlassSurface(tankCapacity);

  // Calculate hardscape slots from capacity
  const hardscapeSlots = calculateHardscapeSlots(tankCapacity);

  // Calculate initial passive resources (surface, flow, light)
  const initialPassiveResources = calculateInitialPassiveResources(
    tankGlassSurface,
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
      hardscapeSlots,
    },
    resources: {
      // Physical
      water: tankCapacity, // Start at full capacity
      temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
      // Passive (calculated)
      surface: initialPassiveResources.surface,
      flow: initialPassiveResources.flow,
      light: initialPassiveResources.light,
      // Biological
      food: 0.0,
      waste: 0.0,
      algae: 0,
      // Chemical (nitrogen cycle)
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      // Dissolved gases (concentration in mg/L)
      oxygen: 8.0, // Start at saturation for ~20°C
      co2: 4.0, // Start at atmospheric equilibrium
      // Bacteria (nitrogen cycle)
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: effectiveRoomTemp,
      tapWaterTemperature: effectiveTapWaterTemp,
      ambientWaste: 0.01, // 0.01 g/hour
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
    logs: [initialLog],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
      lowOxygen: false,
      highCo2: false,
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
  tankGlassSurface: number,
  tankCapacity: number,
  filter: Filter,
  powerhead: Powerhead,
  substrate: Substrate,
  hardscape: Hardscape
): { surface: number; flow: number; light: number } {
  // Surface area
  let surface = tankGlassSurface;
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
  // Will be properly calculated by updatePassiveResources based on tick
  return { surface, flow, light: 0 };
}
