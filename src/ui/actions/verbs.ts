/**
 * The seven husbandry verbs in one shape: a master row, an option row, a
 * preview and a commit. Every option set is the engine's own
 * (`WATER_CHANGE_AMOUNTS`, `MAX_ROOT_TABS`, `TRIM_TARGETS`) and every refusal
 * is an engine guard (`canDose`, `canRootTab`, `canScrubAlgae`,
 * `getPlantsToTrimCount`), stated where the verb would otherwise say what it
 * is about to do — so an unavailable verb is never a dead end.
 */

import {
  applyAction,
  canDose,
  canRootTab,
  canScrubAlgae,
  getPlantsToTrimCount,
  MAX_DOSE_ML,
  MAX_ROOT_TABS,
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
  MIN_SCRUB_PERCENT,
  PLANT_SPECIES_DATA,
  WATER_CHANGE_AMOUNTS,
  type Action,
  type SimulationState,
} from '../../simulation/index.js';
import { FoodResource, getPpm, NitrateResource } from '../../simulation/resources/index.js';
import type { Nutrient, TunableConfig } from '../../simulation/config/index.js';
import {
  bedReading,
  doseToCover,
  nutrientReadings,
  plantLabels,
  TRIM_TARGETS,
} from '../run';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { previewRows, type PreviewRow } from './readings.js';

export type VerbId =
  | 'feed'
  | 'waterChange'
  | 'topOff'
  | 'dose'
  | 'rootTab'
  | 'trimPlants'
  | 'scrubAlgae';

/** The five that need a setting before commit; top-off and scrub fire bare. */
export type SettableVerb = Extract<VerbId, 'feed' | 'waterChange' | 'dose' | 'rootTab' | 'trimPlants'>;

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
  'rootTab',
  'trimPlants',
  'scrubAlgae',
];

/** Grams per feed. Four rungs around the 0.5 g the tank of a dozen tetras eats. */
export const FEED_PRESETS = [0.25, 0.5, 1, 2];

/** Millilitres per dose, well inside the engine's `MAX_DOSE_ML` accident guard. */
export const DOSE_PRESETS = [1, 2, 4];

/** Tabs per push, well inside the engine's `MAX_ROOT_TABS`. */
export const ROOT_TAB_PRESETS = [1, 2, 4];

export const DEFAULT_SETTINGS: VerbSettings = {
  feed: 0.5,
  waterChange: 0.25,
  dose: 2,
  rootTab: 1,
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
  rootTab: { name: 'Root tab', title: 'Push root tabs', home: 'Nutrients' },
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

/** A trim held to one family, where the tank's verb reaches every plant. */
export interface VerbScope {
  familyId: string;
}

/** A trim held to one family, numbered as the roster numbers it — while the family stands. */
function scopeTitle(state: SimulationState, scope: VerbScope): string | null {
  const member = state.plants.find((plant) => plant.familyId === scope.familyId);
  return member ? `Trim family ${plantLabels(state.plants).get(member.id)!.family}` : null;
}

/** The tank as a verb sees it: every plant, or only the family it is held to. */
function reached(state: SimulationState, scope: VerbScope | null): SimulationState {
  if (scope === null) return state;
  return { ...state, plants: state.plants.filter((plant) => plant.familyId === scope.familyId) };
}

/** The action a commit dispatches. Scrub takes no seed — the engine rolls it. */
export function verbAction(
  id: VerbId,
  settings: VerbSettings,
  scope: VerbScope | null = null
): Action {
  switch (id) {
    case 'feed':
      return { type: 'feed', amount: settings.feed };
    case 'waterChange':
      return { type: 'waterChange', amount: settings.waterChange };
    case 'topOff':
      return { type: 'topOff' };
    case 'dose':
      return { type: 'dose', amountMl: settings.dose };
    case 'rootTab':
      return { type: 'rootTab', count: settings.rootTab };
    case 'trimPlants':
      return {
        type: 'trimPlants',
        targetSize: settings.trimPlants,
        ...(scope && { familyId: scope.familyId }),
      };
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
  config: TunableConfig,
  scope: VerbScope | null
): SimulationState[] {
  if (id === 'scrubAlgae') {
    return [MIN_SCRUB_PERCENT, MAX_SCRUB_PERCENT].map(
      (randomPercent) => applyAction(state, { type: 'scrubAlgae', randomPercent }, config).state
    );
  }
  return [applyAction(state, verbAction(id, settings, scope), config).state];
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

/** Grams at the precision the engine keeps food to, or the least step it sits under. */
function grams(value: number): string {
  const step = 10 ** -FoodResource.precision;
  return value < step
    ? `under ${step.toFixed(FoodResource.precision)} g`
    : `${value.toFixed(FoodResource.precision)} g`;
}

function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}

/** Why this verb cannot be committed right now, in the engine's own terms. */
function blockedReason(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  scope: VerbScope | null = null
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
    case 'rootTab':
      return canRootTab(state) ? null : 'no bed to push a tab into';
    case 'trimPlants':
      return getPlantsToTrimCount(reached(state, scope), settings.trimPlants) > 0
        ? null
        : `nothing above ${settings.trimPlants} %`;
    case 'scrubAlgae':
      return canScrubAlgae(state)
        ? null
        : `needs ${MIN_ALGAE_TO_SCRUB} % algae, now ${Math.floor(state.algae.mass)} %`;
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
    case 'rootTab':
      return plural(settings.rootTab, 'tab');
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
  config: TunableConfig,
  scope: VerbScope | null
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
      const advised = advisedRungs(
        DOSE_PRESETS,
        doseToCover(nutrientReadings(state, config), state, config)?.ml ?? null,
        'dose',
        'ml'
      );
      return {
        values: advised.values,
        rung: (ml) => ({
          value: ml,
          label: `${ml} ml`,
          hint:
            advised.hint(ml) ??
            `+${nitrateRise(state, ml, config).toFixed(NitrateResource.precision)} NO₃`,
          disabled: false,
        }),
      };
    }
    case 'rootTab': {
      const bed = bedReading(state, config);
      const advised = advisedRungs(ROOT_TAB_PRESETS, bed.advice, 'rootTab', 'tabs');
      const tabbable = !bed.bare;
      return {
        values: advised.values,
        rung: (count) => ({
          value: count,
          label: String(count),
          hint: advised.hint(count) ?? (tabbable ? `bed ${bedAfter(state, count, config, bed.nutrient)}` : '—'),
          disabled: !tabbable,
        }),
      };
    }
    case 'trimPlants':
      return {
        values: TRIM_TARGETS,
        rung: (target): VerbOption => {
          const count = getPlantsToTrimCount(reached(state, scope), target);
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

const MOST_AT_ONCE = { dose: MAX_DOSE_ML, rootTab: MAX_ROOT_TABS } as const;

/** Advice held to the most the engine takes in one go, so a bigger ask is offered as far as it goes. */
export function advisedAmount(id: keyof typeof MOST_AT_ONCE, advice: number | null): number | null {
  return advice === null ? null : Math.min(advice, MOST_AT_ONCE[id]);
}

/** The presets with the advised amount slotted in, and the hint that rung carries in place of its own. */
function advisedRungs(
  presets: number[],
  advice: number | null,
  id: keyof typeof MOST_AT_ONCE,
  unit: string
): { values: number[]; hint: (value: number) => string | null } {
  const advised = advisedAmount(id, advice);
  if (advised === null) return { values: presets, hint: () => null };
  return {
    values: [...new Set([...presets, advised])].sort((a, b) => a - b),
    hint: (value) =>
      value !== advised ? null : advised !== advice ? `capped at ${advised} ${unit}` : 'covers the ask',
  };
}

function bedAfter(state: SimulationState, count: number, config: TunableConfig, on: Nutrient | null): string {
  const after = applyAction(state, { type: 'rootTab', count }, config).state;
  return bedReading(after, config, undefined, on).text;
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
  config: TunableConfig,
  scope: VerbScope | null
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
    case 'rootTab': {
      const bed = bedReading(state, config);
      if (bed.bare) return 'bare bottom';
      const holds = `bed holds ${bed.text} tabs`;
      return bed.needed > 0 ? `${holds} · roots need ${bed.neededText} tabs` : holds;
    }
    case 'trimPlants': {
      const reach = reached(state, scope);
      const { plants } = reach;
      const largest = plants.reduce((most, plant) => Math.max(most, plant.size), 0);
      const line = `${getPlantsToTrimCount(reach, settings.trimPlants)} of ${plural(plants.length, 'plant')} · largest ${Math.floor(largest)} %`;
      return scope && plants.length > 0
        ? `${PLANT_SPECIES_DATA[plants[0].species].name} · ${line}`
        : line;
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
    'No amount to set — top-off refills to capacity at the tank’s own temperature. The tap’s KH and GH come with it, everything else dissolved is diluted, and pH follows the CO₂ and KH that leaves.',
  scrubAlgae: `No amount to set — a scrub takes a random ${Math.round(MIN_SCRUB_PERCENT * 100)}–${Math.round(MAX_SCRUB_PERCENT * 100)} % of standing algae. What comes off is loose in the water as waste: siphon it out or it rots.`,
};

function commitLabel(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem,
  scope: VerbScope | null
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
    case 'rootTab':
      return `Push ${plural(settings.rootTab, 'tab')}`;
    case 'trimPlants':
      return `Trim ${scope ? 'family ' : ''}to ${settings.trimPlants} %`;
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
  rootTab: 'Tabs',
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
  config: TunableConfig,
  scope: VerbScope | null
): VerbOption[] {
  const { values, rung } = rungsFor(state, setting.verb, units, config, scope);
  const all = values.includes(setting.value)
    ? values
    : [...values, setting.value].sort((a, b) => a - b);
  return all.map(rung);
}

/**
 * Everything the settings step shows for one verb, over what it reaches. Only
 * the selected verb is read this far: the preview applies the action to find
 * its rows.
 */
export function verbDetail(
  state: SimulationState,
  id: VerbId,
  settings: VerbSettings,
  units: UnitSystem,
  config: TunableConfig,
  scope: VerbScope | null = null
): VerbDetail {
  const setting = settingOf(id, settings);
  return {
    id,
    title: (id === 'trimPlants' && scope && scopeTitle(state, scope)) || VERB[id].title,
    meta: meta(state, id, settings, units, config, scope),
    setting,
    options: setting === null ? [] : rungs(state, setting, units, config, scope),
    note: BARE_NOTE[id] ?? null,
    preview: previewRows({
      before: state,
      outcomes: outcomes(state, id, settings, config, scope),
      config,
      units,
    }),
    commitLabel: commitLabel(state, id, settings, units, scope),
    blocked: blockedReason(state, id, settings, scope),
  };
}
