import type { SimulationConfig } from '../../simulation/state.js';
import type { PresetSeed, SeedFishGroup, SeedPlantGroup } from '../../simulation/seed.js';
import type { SubstrateType } from '../../simulation/equipment/substrate.js';
import type { FilterType } from '../../simulation/equipment/filter.js';
import type { HardscapeType } from '../../simulation/equipment/hardscape.js';
import { DAILY, TRIM_TARGET, WEEKLY, type Chore, type Schedule, type ScheduleEntry } from './keeper.js';
import type { BandOverrides } from './readings.js';
import { LITERS_PER_GALLON, toCelsius } from '../units.js';

export interface Setup {
  name: string;
  about: string;
  gallons: number;
  substrate: SubstrateType;
  hardscape: HardscapeType[];
  /** Tap water carbonate hardness, dKH. */
  tapKh: number;
  /** Tap water general hardness, dGH. */
  tapGh: number;
  heaterF: number | null;
  roomF: number;
  filter: FilterType | null;
  /** Fixture PAR at the surface and hours a day. */
  light: { par: number; hours: number } | null;
  /** CO₂ bubbles per second, on an hour before the lights. */
  co2: number | null;
  /** Auto-doser ml a day. */
  doser: number | null;
  ato: boolean;
  plants: SeedPlantGroup[];
  fish: SeedFishGroup[];
  cycled: boolean;
  schedule: Schedule;
  /** Day the keeper rearranges the scape, once. */
  rescapeOn?: number;
  bands?: BandOverrides;
}

const LIGHTS_ON = 10;
const HEATER_WATTS_PER_GALLON = 5;

export function toConfig(setup: Setup): SimulationConfig {
  const { light } = setup;
  return {
    tankCapacity: setup.gallons * LITERS_PER_GALLON,
    initialTemperature: toCelsius(setup.heaterF ?? setup.roomF),
    roomTemperature: toCelsius(setup.roomF),
    tapKh: setup.tapKh,
    tapGh: setup.tapGh,
    heater:
      setup.heaterF === null
        ? { enabled: false }
        : {
            enabled: true,
            targetTemperature: toCelsius(setup.heaterF),
            wattage: setup.gallons * HEATER_WATTS_PER_GALLON,
          },
    filter: setup.filter === null ? { enabled: false } : { enabled: true, type: setup.filter },
    light:
      light === null
        ? { enabled: false }
        : { enabled: true, par: light.par, schedule: { startHour: LIGHTS_ON, duration: light.hours } },
    substrate: { type: setup.substrate },
    hardscape: { items: setup.hardscape.map((type, i) => ({ id: `${type}-${i}`, type })) },
    ato: { enabled: setup.ato },
    co2Generator:
      setup.co2 === null || light === null
        ? { enabled: false }
        : {
            enabled: true,
            bubbleRate: setup.co2,
            schedule: { startHour: LIGHTS_ON - 1, duration: light.hours },
          },
    autoDoser:
      setup.doser === null
        ? { enabled: false }
        : { enabled: true, doseAmountMl: setup.doser, schedule: { startHour: LIGHTS_ON, duration: 1 } },
    powerhead: { enabled: false },
    airPump: { enabled: false },
  };
}

export function toSeed(setup: Setup): PresetSeed {
  return {
    bacteria: setup.cycled ? 'cycled' : undefined,
    plants: setup.plants,
    fish: setup.fish,
  };
}

const FEED_SHARE_OF_STOCK = 0.02;

const daily = (action: Chore): ScheduleEntry => ({ every: DAILY, action });
const weekly = (action: Chore): ScheduleEntry => ({ every: WEEKLY, action });

const dose = (amountMl: number): ScheduleEntry => weekly({ type: 'dose', amountMl });
const trim = weekly({ type: 'trimPlants', targetSize: TRIM_TARGET });

const maintained: Schedule = [
  weekly({ type: 'waterChange', amount: 0.25 }),
  weekly({ type: 'scrubAlgae' }),
  daily({ type: 'topOff' }),
  daily({ type: 'feed', shareOfStock: FEED_SHARE_OF_STOCK }),
];

export const PLANTING_SIZE = 50;

export const SETUPS: Setup[] = [
  {
    name: 'nano',
    about: '5 gal nano, one betta over a few epiphytes',
    gallons: 5,
    substrate: 'gravel',
    hardscape: [],
    tapKh: 5,
    tapGh: 7,
    heaterF: 78,
    roomF: 72,
    filter: 'sponge',
    light: { par: 40, hours: 8 },
    co2: null,
    doser: null,
    ato: false,
    plants: [
      { species: 'anubias', count: 2, size: PLANTING_SIZE },
      { species: 'java_fern', count: 2, size: PLANTING_SIZE },
    ],
    fish: [{ species: 'betta', count: 1, sex: 'male' }],
    cycled: true,
    schedule: [...maintained, dose(1)],
  },
  {
    name: 'low-tech',
    about: '20 gal low-tech planted, tetras and cories',
    gallons: 20,
    substrate: 'aqua_soil',
    hardscape: [],
    tapKh: 4,
    tapGh: 6,
    heaterF: 77,
    roomF: 72,
    filter: 'hob',
    light: { par: 50, hours: 8 },
    co2: null,
    doser: null,
    ato: false,
    plants: [
      { species: 'java_fern', count: 3, size: PLANTING_SIZE },
      { species: 'anubias', count: 2, size: PLANTING_SIZE },
      { species: 'amazon_sword', count: 2, size: PLANTING_SIZE },
    ],
    fish: [
      { species: 'neon_tetra', count: 10, sex: 'female' },
      { species: 'corydoras', count: 4, sex: 'female' },
    ],
    cycled: true,
    schedule: [...maintained, dose(4), trim],
  },
  {
    name: 'high-tech',
    about: '40 gal high-tech planted, CO₂ and daily dosing',
    gallons: 40,
    substrate: 'aqua_soil',
    hardscape: [],
    tapKh: 4,
    tapGh: 6,
    heaterF: 76,
    roomF: 72,
    filter: 'canister',
    light: { par: 120, hours: 8 },
    co2: 2,
    doser: 6,
    ato: true,
    plants: [
      { species: 'monte_carlo', count: 6, size: PLANTING_SIZE },
      { species: 'dwarf_hairgrass', count: 6, size: PLANTING_SIZE },
      { species: 'amazon_sword', count: 3, size: PLANTING_SIZE },
      { species: 'java_fern', count: 3, size: PLANTING_SIZE },
    ],
    fish: [
      { species: 'neon_tetra', count: 15, sex: 'female' },
      { species: 'corydoras', count: 6, sex: 'female' },
    ],
    cycled: true,
    schedule: [...maintained, trim],
    bands: {
      co2: { green: [15, 35], amber: [8, 40], why: 'injected tanks aim 20–30 mg/L while the lights are on' },
    },
  },
  {
    name: 'community',
    about: '75 gal community, angelfish over schooling fish, a few easy plants',
    gallons: 75,
    substrate: 'sand',
    hardscape: [],
    tapKh: 5,
    tapGh: 7,
    heaterF: 78,
    roomF: 72,
    filter: 'canister',
    light: { par: 60, hours: 9 },
    co2: null,
    doser: null,
    ato: false,
    plants: [
      { species: 'java_fern', count: 4, size: PLANTING_SIZE },
      { species: 'anubias', count: 4, size: PLANTING_SIZE },
      { species: 'amazon_sword', count: 2, size: PLANTING_SIZE },
    ],
    fish: [
      { species: 'angelfish', count: 4, sex: 'female' },
      { species: 'neon_tetra', count: 20, sex: 'female' },
      { species: 'corydoras', count: 8, sex: 'female' },
      { species: 'guppy', count: 6, sex: 'male' },
    ],
    cycled: true,
    schedule: [...maintained, dose(8), trim],
  },
  {
    name: 'low-flow',
    about: '30 gal fish-only on a single sponge filter',
    gallons: 30,
    substrate: 'gravel',
    hardscape: [],
    tapKh: 5,
    tapGh: 7,
    heaterF: 78,
    roomF: 72,
    filter: 'sponge',
    light: { par: 40, hours: 8 },
    co2: null,
    doser: null,
    ato: false,
    plants: [],
    fish: [
      { species: 'guppy', count: 10, sex: 'male' },
      { species: 'neon_tetra', count: 10, sex: 'female' },
      { species: 'corydoras', count: 5, sex: 'female' },
    ],
    cycled: true,
    schedule: maintained,
  },
  {
    name: 'cold',
    about: '20 gal unheated in a 68 °F room, guppies and easy plants',
    gallons: 20,
    substrate: 'gravel',
    hardscape: [],
    tapKh: 5,
    tapGh: 7,
    heaterF: null,
    roomF: 68,
    filter: 'hob',
    light: { par: 40, hours: 8 },
    co2: null,
    doser: null,
    ato: false,
    plants: [
      { species: 'java_fern', count: 2, size: PLANTING_SIZE },
      { species: 'anubias', count: 2, size: PLANTING_SIZE },
    ],
    fish: [{ species: 'guppy', count: 8, sex: 'male' }],
    cycled: true,
    schedule: [...maintained, dose(2)],
    bands: {
      temp: { green: [62, 76], amber: [56, 80], why: 'unheated: room temperature is the point' },
    },
  },
];

export function findSetup(name: string): Setup {
  const setup = SETUPS.find((s) => s.name === name);
  if (setup === undefined) {
    throw new Error(`Unknown setup "${name}". Known: ${SETUPS.map((s) => s.name).join(', ')}`);
  }
  return setup;
}
