import { FISH_SPECIES_DATA, type FishSpecies } from '../../simulation/livestock/species.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../../simulation/plants/species.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { applyConfigSet } from '../config-set.js';
import { PLANTED_AT, type Setup } from './setups.js';

export type Tweak =
  | { kind: 'plant'; species: PlantSpecies; count: number; size?: number }
  | { kind: 'fish'; species: FishSpecies; count: number }
  | { kind: 'light'; factor: number }
  | { kind: 'feed'; grams: number }
  | { kind: 'gallons'; gallons: number }
  | { kind: 'set'; path: string; value: string }
  | { kind: 'uncycled' };

export const TWEAK_FLAGS = ['plant', 'fish', 'light', 'feed', 'no-feed', 'gal', 'set', 'uncycled'];

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

function oneOf<T extends string>(raw: string, known: Record<T, unknown>, what: string): T {
  if (!(raw in known)) {
    throw new Error(`Unknown ${what} "${raw}". Known: ${Object.keys(known).join(', ')}`);
  }
  return raw as T;
}

/** `--<flag>=<value>` as a tweak. */
export function parseTweak(flag: string, value: string | undefined): Tweak {
  switch (flag) {
    case 'plant': {
      const [species = '', n, size] = (value ?? '').split(':');
      return {
        kind: 'plant',
        species: oneOf(species, PLANT_SPECIES_DATA, 'plant species'),
        count: count(n, 'plant count'),
        ...(size === undefined ? {} : { size: positive(size, 'plant size') }),
      };
    }
    case 'fish': {
      const [species = '', n] = (value ?? '').split(':');
      return {
        kind: 'fish',
        species: oneOf(species, FISH_SPECIES_DATA, 'fish species'),
        count: count(n, 'fish count'),
      };
    }
    case 'light':
      return { kind: 'light', factor: positive(value, 'light factor') };
    case 'feed': {
      const grams = Number(value);
      if (value === undefined || !Number.isFinite(grams) || grams < 0) {
        throw new Error(`feed takes grams a day (0 stops feeding), got "${value ?? ''}".`);
      }
      return { kind: 'feed', grams };
    }
    case 'no-feed':
      return { kind: 'feed', grams: 0 };
    case 'gal':
      return { kind: 'gallons', gallons: positive(value, 'gal') };
    case 'set': {
      const eq = (value ?? '').indexOf('=');
      if (eq <= 0) throw new Error(`set takes <dotted.path>=<value>, got "${value ?? ''}".`);
      return { kind: 'set', path: value!.slice(0, eq), value: value!.slice(eq + 1) };
    }
    case 'uncycled':
      return { kind: 'uncycled' };
    default:
      throw new Error(`Unknown tweak --${flag}. Tweaks: ${TWEAK_FLAGS.map((f) => `--${f}`).join(', ')}`);
  }
}

export function applyTweak(
  { setup, config }: { setup: Setup; config: TunableConfig },
  tweak: Tweak
): { setup: Setup; config: TunableConfig } {
  switch (tweak.kind) {
    case 'plant':
      return {
        setup: {
          ...setup,
          plants: [...setup.plants, { species: tweak.species, count: tweak.count, size: tweak.size ?? PLANTED_AT }],
        },
        config,
      };
    case 'fish':
      return {
        setup: {
          ...setup,
          fish: [...setup.fish, { species: tweak.species, count: tweak.count, sex: 'female' }],
        },
        config,
      };
    case 'light':
      return {
        setup: { ...setup, light: setup.light && { ...setup.light, par: setup.light.par * tweak.factor } },
        config,
      };
    case 'feed':
      return { setup: { ...setup, routine: { ...setup.routine, feed: tweak.grams } }, config };
    case 'gallons':
      return { setup: { ...setup, gallons: tweak.gallons }, config };
    case 'set':
      return { setup, config: applyConfigSet(config, tweak.path, tweak.value) };
    case 'uncycled':
      return { setup: { ...setup, cycled: false }, config };
  }
}
