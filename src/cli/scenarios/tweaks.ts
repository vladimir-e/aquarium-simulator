import { FISH_SPECIES_DATA } from '../../simulation/livestock/species.js';
import { PLANT_SPECIES_DATA } from '../../simulation/plants/species.js';
import { HARDSCAPE_SURFACE } from '../../simulation/equipment/hardscape.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { applyConfigSet } from '../config-set.js';
import { parseScheduleFlag, SCHEDULE_FLAG_NAMES, withOverride } from './keeper.js';
import { PLANTING_SIZE, type Setup } from './setups.js';

export interface Tank {
  setup: Setup;
  config: TunableConfig;
}

export interface Tweak {
  text: string;
  apply: (tank: Tank) => Tank;
}

export const TWEAK_FLAGS = [
  'plant',
  'fish',
  'rock',
  'tap-kh',
  'tap-gh',
  'light',
  'gal',
  'set',
  'uncycled',
  ...SCHEDULE_FLAG_NAMES,
];

function positive(raw: string | undefined, what: string): number {
  const value = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${what} must be a positive number, got "${raw ?? ''}".`);
  }
  return value;
}

function count(raw: string | undefined, what: string): number {
  const value = positive(raw ?? '1', what);
  if (!Number.isInteger(value)) throw new Error(`${what} must be a whole number, got "${raw}".`);
  return value;
}

function hardness(raw: string | undefined, what: string, unit: string): number {
  const value = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${what} must be a ${unit} of 0 or more, got "${raw ?? ''}".`);
  }
  return value;
}

function oneOf<T extends string>(raw: string, known: Record<T, unknown>, what: string): T {
  if (!Object.hasOwn(known, raw)) {
    throw new Error(`Unknown ${what} "${raw}". Known: ${Object.keys(known).join(', ')}`);
  }
  return raw as T;
}

const warn = (text: string): void => {
  process.stderr.write(`warning: ${text}\n`);
};

const onSetup =
  (change: (setup: Setup) => Setup) =>
  ({ setup, config }: Tank): Tank => ({ setup: change(setup), config });

function tweakApply(flag: string, value: string | undefined): Tweak['apply'] {
  switch (flag) {
    case 'plant': {
      const [name = '', n, size] = (value ?? '').split(':');
      const group = {
        species: oneOf(name, PLANT_SPECIES_DATA, 'plant species'),
        count: count(n, 'plant count'),
        size: size === undefined ? PLANTING_SIZE : positive(size, 'plant size'),
      };
      return onSetup((setup) => ({ ...setup, plants: [...setup.plants, group] }));
    }
    case 'fish': {
      const [name = '', n] = (value ?? '').split(':');
      const group = {
        species: oneOf(name, FISH_SPECIES_DATA, 'fish species'),
        count: count(n, 'fish count'),
        sex: 'female' as const,
      };
      return onSetup((setup) => ({ ...setup, fish: [...setup.fish, group] }));
    }
    case 'rock': {
      const [name = '', n] = (value ?? '').split(':');
      const type = oneOf(name, HARDSCAPE_SURFACE, 'hardscape type');
      const pieces = Array.from({ length: count(n, 'rock count') }, () => type);
      return onSetup((setup) => ({ ...setup, hardscape: [...setup.hardscape, ...pieces] }));
    }
    case 'tap-kh': {
      const tapKh = hardness(value, 'tap-kh', 'dKH');
      return onSetup((setup) => ({ ...setup, tapKh }));
    }
    case 'tap-gh': {
      const tapGh = hardness(value, 'tap-gh', 'dGH');
      return onSetup((setup) => ({ ...setup, tapGh }));
    }
    case 'light': {
      const factor = positive(value, 'light factor');
      return onSetup((setup) => {
        if (setup.light === null) {
          warn(`--light has no light to scale on ${setup.name}.`);
          return setup;
        }
        return { ...setup, light: { ...setup.light, par: setup.light.par * factor } };
      });
    }
    case 'gal': {
      const gallons = positive(value, 'gal');
      return onSetup((setup) => ({ ...setup, gallons }));
    }
    case 'set': {
      const eq = (value ?? '').indexOf('=');
      if (eq <= 0) throw new Error(`set takes <dotted.path>=<value>, got "${value ?? ''}".`);
      const path = value!.slice(0, eq);
      const raw = value!.slice(eq + 1);
      return ({ setup, config }) => ({ setup, config: applyConfigSet(config, path, raw) });
    }
    case 'uncycled':
      return onSetup((setup) => ({ ...setup, cycled: false }));
    default: {
      const override = parseScheduleFlag(flag, value);
      if (override === null) {
        throw new Error(`Unknown tweak --${flag}. Tweaks: ${TWEAK_FLAGS.map((f) => `--${f}`).join(', ')}`);
      }
      return onSetup((setup) => {
        const schedule = withOverride(setup.schedule, override);
        if (override.entry === null && schedule.length === setup.schedule.length) {
          warn(`--${flag}=off: ${setup.name} has no ${override.type} to drop.`);
        }
        return { ...setup, schedule };
      });
    }
  }
}

export function parseTweak(flag: string, value: string | undefined): Tweak {
  return { text: value === undefined ? `--${flag}` : `--${flag}=${value}`, apply: tweakApply(flag, value) };
}
