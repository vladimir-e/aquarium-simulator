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
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
  MIN_SCRUB_PERCENT,
  WATER_CHANGE_AMOUNTS,
  type Action,
  type SimulationState,
} from '../../simulation/index.js';
import { getPpm, NitrateResource } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { TRIM_TARGETS } from '../run';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { previewRows, type PreviewRow } from './readings.js';

export type VerbId = 'feed' | 'waterChange' | 'topOff' | 'dose' | 'trimPlants' | 'scrubAlgae';

/** The four that need a setting before commit; top-off and scrub fire bare. */
export type SettableVerb = Extract<VerbId, 'feed' | 'waterChange' | 'dose' | 'trimPlants'>;

export type VerbSettings = Record<SettableVerb, number>;

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

const NAME: Record<VerbId, string> = {
  feed: 'Feed',
  waterChange: 'Water Δ',
  topOff: 'Top-off',
  dose: 'Dose',
  trimPlants: 'Trim',
  scrubAlgae: 'Scrub',
};

const TITLE: Record<VerbId, string> = {
  feed: 'Feed',
  waterChange: 'Water change',
  topOff: 'Top off',
  dose: 'Dose fertiliser',
  trimPlants: 'Trim plants',
  scrubAlgae: 'Scrub algae',
};

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
  settings: VerbSettings
): SimulationState[] {
  if (id === 'scrubAlgae') {
    return [MIN_SCRUB_PERCENT, MAX_SCRUB_PERCENT].map(
      (randomPercent) => applyAction(state, { type: 'scrubAlgae', randomPercent }).state
    );
  }
  return [applyAction(state, verbAction(id, settings)).state];
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

function trimCount(state: SimulationState, target: number): number {
  return getPlantsToTrimCount(state, target);
}

function daysOfFood(days: number): string {
  return days < 10 ? `${days.toFixed(1)} d` : `${Math.round(days)} d`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
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
      return trimCount(state, settings.trimPlants) > 0
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
  /** The setting or reading, replaced by the refusal when the verb is off. */
  value: string;
  blocked: string | null;
}

export function verbRow(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem
): VerbRow {
  const blocked = blockedReason(state, id, settings);
  return {
    id,
    name: NAME[id],
    value: blocked ?? rowValue(state, id, settings, units),
    blocked,
  };
}

export function verbRows(
  state: SimulationState,
  settings: VerbSettings,
  units: UnitSystem
): VerbRow[] {
  return VERB_IDS.map((id) => verbRow(state, id, settings, units));
}

export interface VerbOption {
  /** Canonical value, exactly as the action carries it. */
  value: number;
  label: string;
  /** What the value means on this tank, in engine arithmetic. */
  hint: string;
  disabled: boolean;
}

function options(
  state: SimulationState,
  id: VerbId,
  units: UnitSystem,
  config: TunableConfig
): VerbOption[] {
  const water = state.resources.water;

  switch (id) {
    case 'feed': {
      const ration = dailyRation(state, config);
      return FEED_PRESETS.map((amount) => ({
        value: amount,
        label: `${amount} g`,
        hint: ration > 0 ? daysOfFood(amount / ration) : '—',
        disabled: false,
      }));
    }
    case 'waterChange':
      return WATER_CHANGE_AMOUNTS.map((amount) => ({
        value: amount,
        label: `${Math.round(amount * 100)} %`,
        hint: formatVolume(water * amount, units, 0),
        disabled: water <= 0,
      }));
    case 'dose':
      return DOSE_PRESETS.map((ml) => ({
        value: ml,
        label: `${ml} ml`,
        hint: `+${nitrateRise(state, ml).toFixed(NitrateResource.precision)} NO₃`,
        disabled: false,
      }));
    case 'trimPlants':
      return TRIM_TARGETS.map((target) => {
        const count = trimCount(state, target);
        return {
          value: target,
          label: `${target} %`,
          hint: count > 0 ? plural(count, 'plant') : 'none',
          disabled: count === 0,
        };
      });
    case 'topOff':
    case 'scrubAlgae':
      return [];
  }
}

function nitrateRise(state: SimulationState, ml: number): number {
  const after = applyAction(state, { type: 'dose', amountMl: ml }).state;
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
          : `${state.fish.length} fish eat ${dailyRation(state, config).toFixed(2)} g a day`;
      return state.resources.food > 0
        ? `${mouths} · ${state.resources.food.toFixed(2)} g still in the water`
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
      return `${trimCount(state, settings.trimPlants)} of ${plural(state.plants.length, 'plant')} · tallest ${Math.round(tallest)} %`;
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
      return `Change water · ${Math.round(settings.waterChange * 100)} %`;
    case 'topOff':
      return `Top off · +${formatVolume(headroom(state), units, 1)}`;
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
  optionsLabel: string;
  /** The setting the chips write to — null for the two verbs that fire bare. */
  setting: { verb: SettableVerb; value: number } | null;
  options: VerbOption[];
  /** Replaces the chip row when the verb takes no setting. */
  note: string | null;
  preview: PreviewRow[];
  commitLabel: string;
  blocked: string | null;
}

function settingOf(id: VerbId, settings: VerbSettings): VerbDetail['setting'] {
  if (id === 'topOff' || id === 'scrubAlgae') return null;
  return { verb: id, value: settings[id] };
}

const OPTIONS_LABEL: Record<VerbId, string> = {
  feed: 'Amount',
  waterChange: 'Replace',
  topOff: 'Amount',
  dose: 'Amount',
  trimPlants: 'Trim to',
  scrubAlgae: 'Amount',
};

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
  return {
    id,
    title: TITLE[id],
    meta: meta(state, id, settings, units, config),
    optionsLabel: OPTIONS_LABEL[id],
    setting: settingOf(id, settings),
    options: options(state, id, units, config),
    note: BARE_NOTE[id] ?? null,
    preview: previewRows(state, outcomes(state, id, settings), units),
    commitLabel: commitLabel(state, id, settings, units),
    blocked: blockedReason(state, id, settings),
  };
}
