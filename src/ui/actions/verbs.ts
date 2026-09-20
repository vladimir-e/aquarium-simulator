/**
 * The six husbandry verbs in one shape: a master row, an option row, a preview
 * and a commit. Every option set is the engine's own (`WATER_CHANGE_AMOUNTS`,
 * `TRIM_TARGETS`) and every refusal is an engine guard (`canDose`,
 * `canScrubAlgae`, `getPlantsToTrimCount`), stated where the verb would
 * otherwise say what it is about to do — so an unavailable verb is never a
 * dead end.
 */

import {
  applyAction,
  canDose,
  canScrubAlgae,
  getPlantsToTrimCount,
  MAX_DOSE_ML,
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
  MIN_SCRUB_PERCENT,
  WATER_CHANGE_AMOUNTS,
  type Action,
  type SimulationState,
} from '../../simulation/index.js';
import { FoodResource, getPpm, NitrateResource } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { doseToCover, nutrientReadings, TRIM_TARGETS } from '../run';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { previewRows, type PreviewRow } from './readings.js';

export type VerbId = 'feed' | 'waterChange' | 'topOff' | 'dose' | 'trimPlants' | 'scrubAlgae';

/** The four that need a setting before commit; top-off and scrub fire bare. */
export type SettableVerb = Extract<VerbId, 'feed' | 'waterChange' | 'dose' | 'trimPlants'>;

export type VerbSettings = Record<SettableVerb, number>;

/** Top-off refills to capacity and a scrub is a roll: neither takes an amount. */
export function isSettable(id: VerbId): id is SettableVerb {
  return id !== 'topOff' && id !== 'scrubAlgae';
}

/** The settings a surface asked for, where the verb takes an amount at all. */
export function withAmount(settings: VerbSettings, id: VerbId, at?: number): VerbSettings {
  return at !== undefined && isSettable(id) ? { ...settings, [id]: at } : settings;
}

/** The order the master list reads in, on either form factor. */
export const VERB_IDS: VerbId[] = [
  'feed',
  'waterChange',
  'topOff',
  'dose',
  'trimPlants',
  'scrubAlgae',
];

/** Grams per feed. Four rungs around the 0.5 g the tank of a dozen tetras eats. */
export const FEED_PRESETS = [0.25, 0.5, 1, 2];

/** Millilitres per dose, well inside the engine's `MAX_DOSE_ML` accident guard. */
export const DOSE_PRESETS = [1, 2, 4];

export const DEFAULT_SETTINGS: VerbSettings = {
  feed: 0.5,
  waterChange: 0.25,
  dose: 2,
  trimPlants: 75,
};

/**
 * What each verb is called where it is listed, what its own sheet is titled,
 * and the module whose footer carries it.
 */
const VERB: Record<VerbId, { name: string; title: string; home: string }> = {
  feed: { name: 'Feed', title: 'Feed', home: 'Life' },
  waterChange: { name: 'Water change', title: 'Water change', home: 'Water' },
  topOff: { name: 'Top off', title: 'Top off', home: 'Water' },
  dose: { name: 'Dose', title: 'Dose fertiliser', home: 'Nutrients' },
  trimPlants: { name: 'Trim', title: 'Trim plants', home: 'Life' },
  scrubAlgae: { name: 'Scrub', title: 'Scrub algae', home: 'Life' },
};

/**
 * The verbs that build the tank rather than keep it. They take no preview and
 * no amount: each one is the "+" of its module, and the palette hands the
 * reader straight to it.
 */
export interface BuildVerb {
  id: string;
  name: string;
  home: string;
  /** The module it builds in, and the picker `?add=` opens once there. */
  path: string;
  add: string;
}

export const BUILD_VERBS: BuildVerb[] = [
  { id: 'addFish', name: 'Add fish', home: 'Life', path: '/life', add: 'fish' },
  { id: 'addPlant', name: 'Add plant', home: 'Life', path: '/life', add: 'plant' },
  { id: 'addHardscape', name: 'Add hardscape', home: 'Gear', path: '/gear', add: 'hardscape' },
];

/** The action a commit dispatches. Scrub takes no seed — the engine rolls it. */
export function verbAction(id: VerbId, settings: VerbSettings): Action {
  switch (id) {
    case 'feed':
      return { type: 'feed', amount: settings.feed };
    case 'waterChange':
      return { type: 'waterChange', amount: settings.waterChange };
    case 'topOff':
      return { type: 'topOff' };
    case 'dose':
      return { type: 'dose', amountMl: settings.dose };
    case 'trimPlants':
      return { type: 'trimPlants', targetSize: settings.trimPlants };
    case 'scrubAlgae':
      return { type: 'scrubAlgae' };
  }
}

/**
 * The states a commit could land in. Scrub returns both ends of the engine's
 * 10–30 % roll so the preview can show the range it actually spans.
 */
function outcomes(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  config: TunableConfig
): SimulationState[] {
  if (id === 'scrubAlgae') {
    return [MIN_SCRUB_PERCENT, MAX_SCRUB_PERCENT].map(
      (randomPercent) => applyAction(state, { type: 'scrubAlgae', randomPercent }, config).state
    );
  }
  return [applyAction(state, verbAction(id, settings), config).state];
}

function headroom(state: SimulationState): number {
  return Math.max(0, state.tank.capacity - state.resources.water);
}

/**
 * Grams that hold the roster's satiation level for a day: what a day's decay
 * costs, priced by the engine's own intake rule. A ration, not a projection —
 * the fish can only swallow an hour's worth at a time, which is why the rest of
 * a big feed shows up in the preview as food left standing in the water.
 */
function dailyRation(state: SimulationState, config: TunableConfig): number {
  const { baseFoodRate, satiationDecayRate } = config.livestock;
  const dayOfDecay = Math.min(100, satiationDecayRate * 24) / 100;
  return state.fish.reduce((total, fish) => total + dayOfDecay * fish.mass * baseFoodRate, 0);
}

/** A ration that outlasts a month says so rather than counting the years. */
const FOOD_HORIZON_DAYS = 30;

function daysOfFood(days: number): string {
  if (days >= FOOD_HORIZON_DAYS) return `${FOOD_HORIZON_DAYS}+ d`;
  return days < 10 ? `${days.toFixed(1)} d` : `${Math.round(days)} d`;
}

/** Grams at the precision the engine keeps food to, or the floor it sits under. */
function grams(value: number): string {
  const floor = 10 ** -FoodResource.precision;
  return value < floor
    ? `under ${floor.toFixed(FoodResource.precision)} g`
    : `${value.toFixed(FoodResource.precision)} g`;
}

function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}

/** Why this verb cannot be committed right now, in the engine's own terms. */
function blockedReason(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings
): string | null {
  switch (id) {
    case 'feed':
      return null;
    case 'waterChange':
      return state.resources.water > 0 ? null : 'no water to change';
    case 'topOff':
      return headroom(state) > 0 ? null : 'already at capacity';
    case 'dose':
      return canDose(state) ? null : 'no plants to fertilise';
    case 'trimPlants':
      return getPlantsToTrimCount(state, settings.trimPlants) > 0
        ? null
        : `nothing above ${settings.trimPlants} %`;
    case 'scrubAlgae':
      return canScrubAlgae(state)
        ? null
        : `needs ${MIN_ALGAE_TO_SCRUB} % algae, now ${Math.round(state.algae.mass)} %`;
  }
}

/** The number the verb acts on — its setting when it has one, its reading when it does not. */
function rowValue(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem
): string {
  switch (id) {
    case 'feed':
      return `${settings.feed} g`;
    case 'waterChange':
      return `${Math.round(settings.waterChange * 100)} %`;
    case 'topOff':
      return `+${formatVolume(headroom(state), units, 1)}`;
    case 'dose':
      return `${settings.dose} ml`;
    case 'trimPlants':
      return `to ${settings.trimPlants} %`;
    case 'scrubAlgae':
      return `${Math.round(state.algae.mass)} %`;
  }
}

export interface VerbRow {
  id: VerbId;
  name: string;
  /** The amount this verb would use, or the reading it acts on. */
  value: string;
  /** The module the verb lives in, so the palette is never the only way back. */
  home: string;
  blocked: string | null;
}

export function verbRow(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem
): VerbRow {
  return {
    id,
    name: VERB[id].name,
    value: rowValue(state, id, settings, units),
    home: VERB[id].home,
    blocked: blockedReason(state, id, settings),
  };
}

export function verbRows(
  state: SimulationState,
  settings: VerbSettings,
  units: UnitSystem
): VerbRow[] {
  return VERB_IDS.map((id) => verbRow(state, id, settings, units));
}

/** What the verb is called wherever it appears. */
export function verbName(id: VerbId): string {
  return VERB[id].name;
}

/**
 * The verb as a footer button reads it: the name and the amount it is standing
 * on, so a widget says what would happen rather than opening a menu to ask.
 */
export function verbLabel(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem
): string {
  return `${VERB[id].name} · ${rowValue(state, id, settings, units)}`;
}

export interface VerbOption {
  /** Canonical value, exactly as the action carries it. */
  value: number;
  label: string;
  /** What the value means on this tank, in engine arithmetic. */
  hint: string;
  disabled: boolean;
}

/** The rungs a verb offers, and how any one amount reads on this tank. */
interface Rungs {
  values: number[];
  rung: (value: number) => VerbOption;
}

function rungsFor(
  state: SimulationState,
  id: SettableVerb,
  units: UnitSystem,
  config: TunableConfig
): Rungs {
  const water = state.resources.water;

  switch (id) {
    case 'feed': {
      const ration = dailyRation(state, config);
      return {
        values: FEED_PRESETS,
        rung: (amount) => ({
          value: amount,
          label: `${amount} g`,
          hint: ration > 0 ? daysOfFood(amount / ration) : '—',
          disabled: false,
        }),
      };
    }
    case 'waterChange':
      return {
        values: [...WATER_CHANGE_AMOUNTS],
        rung: (amount) => ({
          value: amount,
          label: `${Math.round(amount * 100)} %`,
          hint: formatVolume(water * amount, units, 0),
          disabled: water <= 0,
        }),
      };
    case 'dose': {
      const advice = doseToCover(nutrientReadings(state, config), state, config);
      // The engine takes 50 ml in one dose; a bigger ask is offered as far as it goes.
      const advised = advice === null ? null : Math.min(advice.ml, MAX_DOSE_ML);
      const asked =
        advice?.overSingleDose === true ? `capped at ${MAX_DOSE_ML} ml` : 'covers the ask';
      return {
        values:
          advised === null
            ? DOSE_PRESETS
            : [...new Set([...DOSE_PRESETS, advised])].sort((a, b) => a - b),
        rung: (ml) => ({
          value: ml,
          label: `${ml} ml`,
          hint:
            ml === advised
              ? asked
              : `+${nitrateRise(state, ml, config).toFixed(NitrateResource.precision)} NO₃`,
          disabled: false,
        }),
      };
    }
    case 'trimPlants':
      return {
        values: TRIM_TARGETS,
        rung: (target): VerbOption => {
          const count = getPlantsToTrimCount(state, target);
          return {
            value: target,
            label: `${target} %`,
            hint: count > 0 ? plural(count, 'plant') : 'none',
            disabled: count === 0,
          };
        },
      };
  }
}

function nitrateRise(state: SimulationState, ml: number, config: TunableConfig): number {
  const after = applyAction(state, { type: 'dose', amountMl: ml }, config).state;
  return (
    getPpm(after.resources.nitrate, after.resources.water) -
    getPpm(state.resources.nitrate, state.resources.water)
  );
}

/** The sentence beside the title: what this commit is about to move. */
function meta(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem,
  config: TunableConfig
): string {
  const water = state.resources.water;

  switch (id) {
    case 'feed': {
      const mouths =
        state.fish.length === 0
          ? 'no fish to feed'
          : `${plural(state.fish.length, 'fish', 'fish')} ${state.fish.length === 1 ? 'eats' : 'eat'} ${grams(dailyRation(state, config))} a day`;
      return state.resources.food > 0
        ? `${mouths} · ${grams(state.resources.food)} still in the water`
        : mouths;
    }
    case 'waterChange': {
      const out = water * settings.waterChange;
      return `${formatVolume(out, units, 1)} out · ${formatVolume(state.tank.capacity - (water - out), units, 1)} tap in`;
    }
    case 'topOff':
      return `refills to ${formatVolume(state.tank.capacity, units, 0)}`;
    case 'dose':
      return `into ${formatVolume(water, units, 1)}`;
    case 'trimPlants': {
      const tallest = state.plants.reduce((most, plant) => Math.max(most, plant.size), 0);
      return `${getPlantsToTrimCount(state, settings.trimPlants)} of ${plural(state.plants.length, 'plant')} · tallest ${Math.round(tallest)} %`;
    }
    case 'scrubAlgae':
      return `algae ${Math.round(state.algae.mass)} %`;
  }
}

/**
 * Prose in the chip row's slot for the two bare verbs, so the settings step is
 * an honest statement rather than an empty panel.
 */
const BARE_NOTE: Partial<Record<VerbId, string>> = {
  topOff:
    'No amount to set — top-off refills to capacity. It brings no tap chemistry with it, so temperature and pH hold where they are and everything dissolved is diluted.',
  scrubAlgae: `No amount to set — a scrub takes a random ${Math.round(MIN_SCRUB_PERCENT * 100)}–${Math.round(MAX_SCRUB_PERCENT * 100)} % of standing algae. What comes off leaves the system; it does not become waste.`,
};

function commitLabel(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem
): string {
  switch (id) {
    case 'feed':
      return `Feed ${settings.feed} g`;
    case 'waterChange':
      return `Change ${Math.round(settings.waterChange * 100)} % water`;
    case 'topOff':
      return `Top off +${formatVolume(headroom(state), units, 1)}`;
    case 'dose':
      return `Dose ${settings.dose} ml`;
    case 'trimPlants':
      return `Trim to ${settings.trimPlants} %`;
    case 'scrubAlgae':
      return 'Scrub algae';
  }
}

export interface VerbDetail {
  id: VerbId;
  title: string;
  meta: string;
  /** The setting the chips write to, and what they are headed — null for the
   * two verbs that fire bare. */
  setting: { verb: SettableVerb; value: number; label: string } | null;
  options: VerbOption[];
  /** Replaces the chip row when the verb takes no setting. */
  note: string | null;
  preview: PreviewRow[];
  commitLabel: string;
  blocked: string | null;
}

function settingOf(id: VerbId, settings: VerbSettings): VerbDetail['setting'] {
  return isSettable(id) ? { verb: id, value: settings[id], label: OPTIONS_LABEL[id] } : null;
}

const OPTIONS_LABEL: Record<SettableVerb, string> = {
  feed: 'Amount',
  waterChange: 'Replace',
  dose: 'Amount',
  trimPlants: 'Trim to',
};

/**
 * The rungs, with the one the reader is standing on among them: a tank that
 * stops asking for 3 ml does not move a reader who chose 3 ml onto another
 * rung behind their back.
 */
function rungs(
  state: SimulationState,
  setting: NonNullable<VerbDetail['setting']>,
  units: UnitSystem,
  config: TunableConfig
): VerbOption[] {
  const { values, rung } = rungsFor(state, setting.verb, units, config);
  const all = values.includes(setting.value)
    ? values
    : [...values, setting.value].sort((a, b) => a - b);
  return all.map(rung);
}

/**
 * Everything the settings step shows for one verb. Only the selected verb is
 * read this far: the preview applies the action to find its rows.
 */
export function verbDetail(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem,
  config: TunableConfig
): VerbDetail {
  const setting = settingOf(id, settings);
  return {
    id,
    title: VERB[id].title,
    meta: meta(state, id, settings, units, config),
    setting,
    options: setting === null ? [] : rungs(state, setting, units, config),
    note: BARE_NOTE[id] ?? null,
    preview: previewRows({
      before: state,
      outcomes: outcomes(state, id, settings, config),
      config,
      units,
    }),
    commitLabel: commitLabel(state, id, settings, units),
    blocked: blockedReason(state, id, settings),
  };
}
