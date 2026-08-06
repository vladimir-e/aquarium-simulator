/**
 * Simulation state types and factory functions.
 */

import { createLog, type LogEntry } from './core/logging.js';
import { createRng, type RngState } from './core/rng.js';
import type { DailySchedule } from './core/schedule.js';
import type { Filter } from './equipment/filter.js';
import { DEFAULT_FILTER, getFilterSurface, getFilterFlow } from './equipment/filter.js';
import type { Powerhead } from './equipment/powerhead.js';
import { DEFAULT_POWERHEAD, getPowerheadFlow } from './equipment/powerhead.js';
import type { Substrate } from './equipment/substrate.js';
import {
  DEFAULT_SUBSTRATE,
  getSubstrateSurface,
  getSubstrateOrganicReserve,
} from './equipment/substrate.js';
import type { Hardscape } from './equipment/hardscape.js';
import { DEFAULT_HARDSCAPE, calculateHardscapeTotalSurface } from './equipment/hardscape.js';
import type { Light } from './equipment/light.js';
import { DEFAULT_LIGHT } from './equipment/light.js';
import type { AirPump } from './equipment/air-pump.js';
import { DEFAULT_AIR_PUMP, getAirPumpFlow } from './equipment/air-pump.js';
import type { AutoDoser } from './equipment/auto-doser.js';
import { DEFAULT_AUTO_DOSER } from './equipment/auto-doser.js';
import { applySeed, type PresetSeed } from './seed.js';
import type { PlantSpecies } from './plants/species.js';
import type { FishSpecies, FishSex, FishLifeStage } from './livestock/species.js';

/**
 * Individual fish in the tank.
 */
export interface Fish {
  /** Unique identifier */
  id: string;
  /** Fish species type */
  species: FishSpecies;
  /** Body mass in grams — `adultMass` for adults, age-interpolated for fry. */
  mass: number;
  /** Health percentage (0-100, fish dies at 0) */
  health: number;
  /** Age in ticks (hours) */
  age: number;
  /** Satiation percentage (0-100, 0=starving, 100=stuffed). */
  satiation: number;
  /** Sex, used for reproduction */
  sex: FishSex;
  /**
   * Life stage. Fry grow from `fryMassFraction × adultMass` toward
   * `adultMass`, interpolated by age, and flip to `adult` at the species
   * `maturityAge`. A seed may name a stage the age wouldn't imply — an
   * adult still short of `maturityAge`, say — so the stage can't be
   * derived from age alone; it is stored, and breeding asks for both
   * (see `livestock/breeding.ts`).
   */
  stage: FishLifeStage;
  /**
   * Per-individual hardiness offset applied on top of species hardiness.
   * Sampled once at `addFish` time (never re-rolled) so weaker fish fail
   * first when conditions degrade, producing staggered deaths instead of
   * synchronized mass die-offs. Range: ±15 % of species baseline.
   */
  hardinessOffset: number;
  /**
   * Surplus vitality bank — a reserve buffer above health. Fills while
   * the fish is at full health (net > 0 at condition 100), saturating at
   * `LivestockConfig.surplusCap`; drains to absorb damage before health
   * falls. Reproduction spends it on spawning (see
   * `livestock/breeding.ts`). Stored in %/hr-equivalent units;
   * conservation of meaning is on the consumer.
   */
  surplus: number;
}

/**
 * Algae as a pure population — coverage and a surplus bank.
 *
 * `mass` is aggregate biomass / coverage on the same 0–100 scale the
 * old `Resources.algae` field used (so calibration anchors translate
 * directly). When the net rate from stressors and benefits is
 * positive, the surplus tank fills (photoperiod-gated); when it's
 * negative, the reserve buffer drains first and mass shrinks only by
 * the shortfall. No intermediate `condition` — conditions favouring
 * algae grow it; conditions hostile to it shrink it. `surplus` is the
 * banked reserve: it buffers hostile ticks and drains into mass each
 * daylight tick.
 *
 * One organism, not an array. The shape — coverage plus surplus —
 * is the prototype for future colonies (snails, shrimps): they're
 * populations too, and they don't need condition either.
 */
export interface AlgaeState {
  /** Aggregate biomass / coverage, 0–100 (same scale as the old field). */
  mass: number;
  /** Banked surplus from positive net rate; drained into mass while lights are on. */
  surplus: number;
}

/**
 * A batch of eggs waiting to hatch.
 *
 * Egg-laying species deposit a clutch on spawn; it sits inert until
 * `laidTick + species.breeding.hatchTime`, then hatches into `eggCount`
 * fry at 100 % survival. Eggs aren't guarded or eaten — the clutch is
 * the hook the future predation system attaches to. Livebearers never
 * produce a clutch (fry appear directly).
 */
export interface Clutch {
  /** Unique identifier */
  id: string;
  /** Species that laid the clutch — determines the fry produced. */
  species: FishSpecies;
  /** Number of eggs, each of which hatches into one fry. */
  eggCount: number;
  /** Tick the clutch was laid; hatches at `laidTick + hatchTime`. */
  laidTick: number;
}

/**
 * Individual plant specimen in the tank.
 */
export interface Plant {
  /** Unique identifier */
  id: string;
  /** Plant species type */
  species: PlantSpecies;
  /** Size percentage (can exceed 100% up to species `maxSize`). */
  size: number;
  /** Condition/health percentage (0-100, plant dies below 10%) */
  condition: number;
  /**
   * Banked vitality surplus (%/h units) — a reserve buffer above
   * condition. Fills when condition is full and net is positive
   * (photoperiod-gated, capped at `PlantsConfig.surplusCap`); drains to
   * absorb damage before condition falls; growth spends what's left over,
   * and the remainder banks toward future propagation.
   */
  surplus: number;
}

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
  /** PAR reaching the substrate in µmol/m²/s (0 when lights off) */
  light: number;
  /** Whether aeration is active (air pump or air-driven filter) */
  aeration: boolean;

  // Biological resources
  /** Food available for consumption (grams, 2 decimal precision) */
  food: number;
  /** Organic waste accumulation (grams) */
  waste: number;

  // Chemical resources (nitrogen cycle) - stored as mass (mg)
  // Concentration (ppm) derived as mass/water for display and threshold checks
  /** Ammonia mass in mg (toxic when ppm > 0.1, derive ppm = mass/water) */
  ammonia: number;
  /** Nitrite mass in mg (toxic when ppm > 1.0, derive ppm = mass/water) */
  nitrite: number;
  /** Nitrate mass in mg (accumulates, derive ppm = mass/water, <20 ppm safe) */
  nitrate: number;

  // Plant nutrients - stored as mass (mg)
  // Concentration (ppm) derived as mass/water for display
  /** Phosphate mass in mg (optimal 0.5-2 ppm for plants) */
  phosphate: number;
  /** Potassium mass in mg (optimal 5-20 ppm for plants) */
  potassium: number;
  /** Iron mass in mg (optimal 0.1-0.5 ppm, represents micronutrients) */
  iron: number;

  // Chemical resources (dissolved gases) - stored as concentration (mg/L)
  /** Dissolved oxygen in mg/L (healthy > 6, critical < 4) */
  oxygen: number;
  /** Dissolved CO2 in mg/L (atmospheric ~3-5, harmful > 30) */
  co2: number;

  // Water chemistry
  /** Tank pH (0-14 scale, typical aquarium range 6.0-8.0) */
  ph: number;

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
  /** Tap water pH for water changes and ATO */
  tapWaterPH: number;
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

export interface Co2Generator {
  /** Whether CO2 injection is enabled */
  enabled: boolean;
  /** Bubble rate in bubbles per second (0.5-5.0) */
  bubbleRate: number;
  /** Currently injecting CO2 (based on schedule when enabled) */
  isOn: boolean;
  /** CO2 injection schedule (start hour + duration) */
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
  /** CO2 generator for planted tanks */
  co2Generator: Co2Generator;
  /** Air pump for aeration (air stones) */
  airPump: AirPump;
  /** Auto doser for scheduled fertilizer dosing */
  autoDoser: AutoDoser;
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
  /** Plants in the tank */
  plants: Plant[];
  /** Fish in the tank */
  fish: Fish[];
  /** Unhatched egg clutches from egg-laying species */
  clutches: Clutch[];
  /** Tank-wide algae as a single mass-based organism */
  algae: AlgaeState;
  /** Seed and stream position every draw in this tank comes off. */
  rng: RngState;
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
  /** Tap water pH (defaults to 6.5) */
  tapWaterPH?: number;
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
  substrate?: Pick<Substrate, 'type'>;
  /** Initial hardscape configuration */
  hardscape?: Partial<Hardscape>;
  /** Initial light configuration */
  light?: Partial<Light>;
  /** Initial CO2 generator configuration */
  co2Generator?: Partial<Co2Generator>;
  /** Initial air pump configuration */
  airPump?: Partial<AirPump>;
  /** Initial auto doser configuration */
  autoDoser?: Partial<AutoDoser>;
}

const DEFAULT_TEMPERATURE = 25;
export const DEFAULT_ROOM_TEMPERATURE = 22;
const DEFAULT_TAP_WATER_TEMPERATURE = 20;
const DEFAULT_TAP_WATER_PH = 6.5;
const DEFAULT_INITIAL_PH = 6.5;

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

export { DEFAULT_LIGHT };

export const DEFAULT_CO2_GENERATOR: Co2Generator = {
  enabled: false,
  bubbleRate: 1.0, // 1 bps default
  isOn: false,
  schedule: {
    startHour: 7, // 7am (1 hour before lights default)
    duration: 10, // 10 hours (7am-5pm, ends 1 hour before lights off)
  },
};

export { DEFAULT_AIR_PUMP };

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
 * Height in cm of the box a capacity implies, assuming the standard
 * rectangular shape (length:width:height ≈ 2:1:1). 20 L stands 21.5 cm,
 * 300 L stands 53.1.
 */
export function calculateTankHeight(capacity: number): number {
  return Math.cbrt(capacity / 2) * 10; // liters = dm³
}

/**
 * Calculates tank bacteria surface area from capacity.
 * Includes 4 walls + bottom (excludes top which is open).
 */
export function calculateTankGlassSurface(capacity: number): number {
  const height = calculateTankHeight(capacity);
  const width = height;
  const length = 2 * height;

  return Math.round(2 * (length * height) + 2 * (width * height) + length * width);
}

/**
 * Creates a new simulation state with the given configuration, optionally
 * started at the state a {@link PresetSeed} describes rather than empty.
 * `rngSeed` opens the tank's draw stream — name one and the tank runs the
 * same life every time, organisms, ids and all; leave it out and it takes a
 * time-derived one.
 */
export function createSimulation(
  config: SimulationConfig,
  seed?: PresetSeed,
  rngSeed?: number
): SimulationState {
  const {
    tankCapacity,
    initialTemperature,
    roomTemperature,
    tapWaterTemperature,
    tapWaterPH,
    heater,
    lid,
    ato,
    filter,
    powerhead,
    substrate,
    hardscape,
    light,
    co2Generator,
    airPump,
    autoDoser,
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

  const substrateType = substrate?.type ?? DEFAULT_SUBSTRATE.type;
  const substrateConfig: Substrate = {
    type: substrateType,
    organicReserve: getSubstrateOrganicReserve(substrateType, tankCapacity),
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

  const co2GeneratorConfig: Co2Generator = {
    ...DEFAULT_CO2_GENERATOR,
    ...co2Generator,
    schedule: {
      ...DEFAULT_CO2_GENERATOR.schedule,
      ...co2Generator?.schedule,
    },
  };

  const airPumpConfig: AirPump = {
    ...DEFAULT_AIR_PUMP,
    ...airPump,
  };

  const autoDoserConfig: AutoDoser = {
    ...DEFAULT_AUTO_DOSER,
    ...autoDoser,
    schedule: {
      ...DEFAULT_AUTO_DOSER.schedule,
      ...autoDoser?.schedule,
    },
  };

  const effectiveRoomTemp = roomTemperature ?? DEFAULT_ROOM_TEMPERATURE;
  const effectiveTapWaterTemp = tapWaterTemperature ?? DEFAULT_TAP_WATER_TEMPERATURE;
  const effectiveTapWaterPH = tapWaterPH ?? DEFAULT_TAP_WATER_PH;
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

  // Calculate initial passive resources (surface, flow, light, aeration)
  const initialPassiveResources = calculateInitialPassiveResources(
    tankGlassSurface,
    tankCapacity,
    filterConfig,
    powerheadConfig,
    substrateConfig,
    hardscapeConfig,
    airPumpConfig
  );

  const state: SimulationState = {
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
      aeration: initialPassiveResources.aeration,
      // Biological
      food: 0.0,
      waste: 0.0,
      // Chemical (nitrogen cycle)
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      // Plant nutrients
      phosphate: 0,
      potassium: 0,
      iron: 0,
      // Dissolved gases (concentration in mg/L)
      oxygen: 8.0, // Start at saturation for ~20°C
      co2: 4.0, // Start at atmospheric equilibrium
      // Water chemistry
      ph: DEFAULT_INITIAL_PH, // Slightly acidic, matches tap water default
      // Bacteria (nitrogen cycle)
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: effectiveRoomTemp,
      tapWaterTemperature: effectiveTapWaterTemp,
      tapWaterPH: effectiveTapWaterPH,
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
      co2Generator: co2GeneratorConfig,
      airPump: airPumpConfig,
      autoDoser: autoDoserConfig,
    },
    plants: [],
    fish: [],
    clutches: [],
    // Algae starts at zero biomass and zero surplus. With no
    // condition state, the empty case is naturally inert.
    algae: { mass: 0, surplus: 0 },
    rng: createRng(rngSeed),
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

  if (seed !== undefined) applySeed(state, seed);
  return state;
}

/**
 * Calculates initial passive resources from equipment configuration.
 */
function calculateInitialPassiveResources(
  tankGlassSurface: number,
  tankCapacity: number,
  filter: Filter,
  powerhead: Powerhead,
  substrate: Substrate,
  hardscape: Hardscape,
  airPump: AirPump
): { surface: number; flow: number; light: number; aeration: boolean } {
  // Import isFilterAirDriven inline to avoid circular dependency
  const isFilterAirDriven = filter.type === 'sponge';

  // Surface area
  let surface = tankGlassSurface;
  if (filter.enabled) {
    surface += getFilterSurface(filter.type);
  }
  surface += getSubstrateSurface(substrate.type, tankCapacity);
  surface += calculateHardscapeTotalSurface(hardscape.items);

  // Flow rate (scaled to tank capacity)
  let flow = 0;
  if (filter.enabled) {
    flow += getFilterFlow(filter.type, tankCapacity);
  }
  if (powerhead.enabled) {
    flow += getPowerheadFlow(powerhead.flowRateGPH);
  }
  // Air pump adds small flow from bubble uplift
  if (airPump.enabled) {
    flow += getAirPumpFlow(tankCapacity);
  }

  // Aeration is active if air pump is on OR filter is air-driven (sponge)
  const aeration = airPump.enabled || (filter.enabled && isFilterAirDriven);

  // Light is calculated from the schedule each tick - starts at 0
  return { surface, flow, light: 0, aeration };
}
