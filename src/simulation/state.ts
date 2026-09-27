/**
 * Simulation state types and factory functions.
 */

import { celsius, createLog, liters, measured, type LogEntry } from './core/logging.js';
import { createRng, type RngState } from './core/rng.js';
import type { DailySchedule } from './core/schedule.js';
import type { Filter } from './equipment/filter.js';
import { DEFAULT_FILTER } from './equipment/filter.js';
import type { Powerhead } from './equipment/powerhead.js';
import { DEFAULT_POWERHEAD } from './equipment/powerhead.js';
import type { Substrate } from './equipment/substrate.js';
import { DEFAULT_SUBSTRATE, freshSubstrate } from './equipment/substrate.js';
import type { Hardscape, HardscapeItemSpec } from './equipment/hardscape.js';
import { DEFAULT_HARDSCAPE, createHardscapeItem } from './equipment/hardscape.js';
import type { Light } from './equipment/light.js';
import { DEFAULT_LIGHT, MAX_LIGHT_PAR } from './equipment/light.js';
import { opticsDefaults, type OpticsConfig } from './config/optics.js';
import type { AirPump } from './equipment/air-pump.js';
import { DEFAULT_AIR_PUMP } from './equipment/air-pump.js';
import type { AutoDoser } from './equipment/auto-doser.js';
import { DEFAULT_AUTO_DOSER } from './equipment/auto-doser.js';
import type { AutoFeeder } from './equipment/auto-feeder.js';
import { DEFAULT_AUTO_FEEDER } from './equipment/auto-feeder.js';
import { applySeed, type PresetSeed, type TankSeed } from './seed.js';
import { writePassiveResources } from './equipment/index.js';
import type { AlgaeKind } from './algae/traits.js';
import { emptyBlooms, mapKinds } from './algae/blooms.js';
import { isPlantableSize, MIN_PLANTABLE_SIZE } from './plants/create-plant.js';
import { getGhMass, getKhMass } from './resources/helpers.js';
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
  /** Grams of food in its gut, up to `gutCapacity × mass`. */
  gut: number;
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
   * Vitality bank, in condition points. Fills with income at full health,
   * up to `LivestockConfig.surplusCap`, heals health below 100, and a full
   * bank is what a female spawns on (see `livestock/breeding.ts`).
   */
  surplus: number;
}

/**
 * One kind of bloom: a population run on the plants' vitality model, without
 * a position. `mass` is how full its habitat is, 0–100 — the share of what its
 * habitat holds at a full bloom — so its tissue scales with the habitat.
 * Condition and bank are the bloom's as a whole: the bank buys mass in
 * proportion to the mass already there.
 */
export interface AlgaeState {
  mass: number;
  /** 0–100; the bloom dies back at 0. */
  condition: number;
  /** Vitality bank, in condition points, up to `PlantsConfig.surplusCap`. */
  surplus: number;
}

/** Every kind's bloom, by kind: the kinds are a fixed set every tank holds, so each is read by name and none goes missing. */
export type Blooms = Record<AlgaeKind, AlgaeState>;

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
  /**
   * How full its unit is, % of one grown unit of its growth form — a patch, a
   * specimen, a clump. Growth tapers to nothing at 100, so it never grows past it.
   */
  size: number;
  /** Condition/health percentage (0-100, plant dies at 0) */
  condition: number;
  /**
   * Vitality bank, in condition points. Fills with income at full condition,
   * up to `PlantsConfig.surplusCap`; heals condition below 100, buys size, and
   * a full bank buys an offshoot.
   */
  surplus: number;
  /** The plant whose offshoot this is; null for anything planted or seeded. */
  parentId: string | null;
  /** The founder's id, inherited by every offshoot, so a family outlives its founder. */
  familyId: string;
  /** Age in ticks (hours) in this tank. */
  age: number;
  /**
   * Per-individual offset on everything the plant earns, drawn once at birth
   * within ±`VIGOUR_SPAN`, so clones bud apart instead of in lockstep.
   */
  vigour: number;
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
  /**
   * PAR at the substrate for each hour of the day, slot `tick % 24` rewritten
   * as each hour settles: the last 24 hours the tank was lit by. Not a
   * `ResourceKey` — no effect moves it.
   */
  lightByHour: number[];
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

  // Water chemistry - alkalinity stored as mass (mg)
  /** Alkalinity as mg of CaCO3 (derive dKH with `getDkh`); pH is read off it and CO2 */
  kh: number;
  /** Calcium and magnesium as mg of CaCO3 (derive dGH with `getDgh`) */
  gh: number;

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
  /** Tap water carbonate hardness in dKH, for fills, water changes and top-offs */
  tapKh: number;
  /** Tap water general hardness in dGH, arriving wherever tap KH does */
  tapGh: number;
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
  /** Auto feeder for a scheduled daily ration */
  autoFeeder: AutoFeeder;
}

/**
 * Tracks which alert conditions are currently active.
 * Used to only fire alerts once when crossing thresholds. Each kind of bloom
 * has its own, set while its `bloomLevel` is past 1.
 */
export interface AlertState extends Record<AlgaeKind, boolean> {
  /** Water is below `waterLevelAlertLine` % of capacity */
  waterLevelCritical: boolean;
  /** Free NH₃ is above `FREE_AMMONIA_EDGE` */
  highAmmonia: boolean;
  /** Nitrite is above `NITRITE_EDGE` */
  highNitrite: boolean;
  /** Nitrate is above `NITRATE_EDGE` */
  highNitrate: boolean;
  /** Oxygen is below `OXYGEN_EDGE` */
  lowOxygen: boolean;
  /** CO₂ is above `HIGH_CO2_THRESHOLD` */
  highCo2: boolean;
}

/** Every alert clear: what a new or reset tank starts on. */
export function quietAlerts(): AlertState {
  return {
    waterLevelCritical: false,
    ...mapKinds(() => false),
    highAmmonia: false,
    highNitrite: false,
    highNitrate: false,
    lowOxygen: false,
    highCo2: false,
  };
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
  /** The tank's blooms, one of each kind */
  algae: Blooms;
  /** Seed and stream position every draw in this tank comes off. */
  rng: RngState;
  /** In-memory log storage */
  logs: LogEntry[];
  /** Tracks active alert conditions for threshold-crossing detection */
  alertState: AlertState;
  /** How the tank was seeded at hour zero; absent or empty when it was filled from the tap. */
  seed?: TankSeed;
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
  /** Tap water carbonate hardness in dKH (defaults to 4) */
  tapKh?: number;
  /** Tap water general hardness in dGH (defaults to 6) */
  tapGh?: number;
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
  /** Initial hardscape — each piece goes in fresh */
  hardscape?: { items: HardscapeItemSpec[] };
  /** Initial light configuration */
  light?: Partial<Light>;
  /** Initial CO2 generator configuration */
  co2Generator?: Partial<Co2Generator>;
  /** Initial air pump configuration */
  airPump?: Partial<AirPump>;
  /** Initial auto doser configuration */
  autoDoser?: Partial<AutoDoser>;
  /** Initial auto feeder configuration */
  autoFeeder?: Partial<AutoFeeder>;
  /** Optics the tank will run on, which its first day of light is read through (defaults to the shipped optics) */
  optics?: OpticsConfig;
}

const DEFAULT_TEMPERATURE = 25;
const DEFAULT_ROOM_TEMPERATURE = 22;
const DEFAULT_TAP_WATER_TEMPERATURE = 20;
const DEFAULT_TAP_KH = 4;
const DEFAULT_TAP_GH = 6;

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
 * Every threshold in the engine is a comparison, and `NaN` fails all of them —
 * so one that reaches a resource is never noticed and never leaves: the tank is
 * poisoned for the rest of its life. Construction is the last place it can be
 * refused, and it is refused wherever it sits in the input.
 */
function refuseNonFinite(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`createSimulation: ${path} is ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => refuseNonFinite(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) refuseNonFinite(item, `${path}.${key}`);
  }
}

/**
 * Creates a new simulation state with the given configuration, optionally
 * started at the state a {@link PresetSeed} describes rather than empty.
 * `rngSeed` opens the tank's draw stream — name one and the tank runs the
 * same life every time, organisms, ids and all; leave it out and it takes a
 * time-derived one.
 *
 * Throws on a number the tank could not survive: anything non-finite anywhere
 * in the config or seed, a capacity that isn't positive, a fixture rated
 * past {@link MAX_LIGHT_PAR}, or a seeded plant at a size it could not be planted at.
 */
export function createSimulation(
  config: SimulationConfig,
  seed?: PresetSeed,
  rngSeed?: number
): SimulationState {
  refuseNonFinite(config, 'config');
  refuseNonFinite(seed, 'seed');
  if (config.tankCapacity <= 0) {
    throw new Error(`createSimulation: tankCapacity must be positive, got ${config.tankCapacity}`);
  }
  const par = config.light?.par;
  if (par !== undefined && (par < 0 || par > MAX_LIGHT_PAR)) {
    throw new Error(`createSimulation: light.par must be within 0–${MAX_LIGHT_PAR}, got ${par}`);
  }
  seed?.plants?.forEach(({ size }, i) => {
    if (size !== undefined && !isPlantableSize(size)) {
      throw new Error(`createSimulation: seed.plants[${i}].size must be within ${MIN_PLANTABLE_SIZE}–100, got ${size}`);
    }
  });

  const {
    tankCapacity,
    initialTemperature,
    roomTemperature,
    tapWaterTemperature,
    tapKh,
    tapGh,
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
    autoFeeder,
    optics,
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

  const substrateConfig = freshSubstrate(substrate?.type ?? DEFAULT_SUBSTRATE.type, tankCapacity);

  const hardscapeConfig: Hardscape = {
    items: (hardscape?.items ?? DEFAULT_HARDSCAPE.items).map((item) =>
      createHardscapeItem(item.id, item.type)
    ),
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

  const autoDoserConfig: AutoDoser = { ...DEFAULT_AUTO_DOSER, ...autoDoser };

  const autoFeederConfig: AutoFeeder = { ...DEFAULT_AUTO_FEEDER, ...autoFeeder };

  const effectiveRoomTemp = roomTemperature ?? DEFAULT_ROOM_TEMPERATURE;
  const effectiveTapWaterTemp = tapWaterTemperature ?? DEFAULT_TAP_WATER_TEMPERATURE;
  const effectiveTapKh = tapKh ?? DEFAULT_TAP_KH;
  const effectiveTapGh = tapGh ?? DEFAULT_TAP_GH;
  const heaterStatus = heaterConfig.enabled ? 'enabled' : 'disabled';

  const initialLog = createLog(
    0,
    'simulation',
    'info',
    measured`Simulation created: ${liters(tankCapacity)} tank, ${celsius(effectiveRoomTemp)} room, heater ${heaterStatus}`
  );

  const tank: Tank = { capacity: tankCapacity, hardscapeSlots: calculateHardscapeSlots(tankCapacity) };
  const equipment: Equipment = {
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
    autoFeeder: autoFeederConfig,
  };

  const state: SimulationState = {
    tick: 0,
    tank,
    resources: {
      // Physical
      water: tankCapacity, // Start at full capacity
      temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
      // Passive (settled once the tank is built)
      surface: 0,
      flow: 0,
      light: 0,
      lightByHour: [],
      aeration: false,
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
      // The tank is filled from the tap
      kh: getKhMass(effectiveTapKh, tankCapacity),
      gh: getGhMass(effectiveTapGh, tankCapacity),
      // Bacteria (nitrogen cycle)
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: effectiveRoomTemp,
      tapWaterTemperature: effectiveTapWaterTemp,
      tapKh: effectiveTapKh,
      tapGh: effectiveTapGh,
    },
    equipment,
    plants: [],
    fish: [],
    clutches: [],
    algae: emptyBlooms(),
    rng: createRng(rngSeed),
    logs: [initialLog],
    alertState: quietAlerts(),
  };

  writePassiveResources(state, optics ?? opticsDefaults);
  if (seed !== undefined) applySeed(state, seed);
  return state;
}
