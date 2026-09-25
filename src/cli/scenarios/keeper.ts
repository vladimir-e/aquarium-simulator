import {
  applyAction,
  resetHardscape,
  type Action,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';

export type Chore = Action | { type: 'feed'; shareOfStock: number };

export interface ScheduleEntry {
  every: number;
  action: Chore;
}

export type Schedule = ScheduleEntry[];

export const DAILY = 1;
export const WEEKLY = 7;
export const TRIM_TARGET = 100;
export const VACUUM_SHARE = 0.15;

/** Mid-afternoon, lights on — when a keeper reaches for the test kit, before the day's chores. */
export const SAMPLE_HOUR = 14;
export const KEEPER_HOUR = 19;

export const dayOf = (tick: number): number => Math.floor(tick / 24) + 1;

function toAction(chore: Chore, state: SimulationState): Action | null {
  if (!('shareOfStock' in chore)) return chore;
  const mass = state.fish.reduce((sum, fish) => sum + fish.mass, 0);
  const amount = Math.round(mass * chore.shareOfStock * 100) / 100;
  return amount > 0 ? { type: 'feed', amount } : null;
}

export function isKeeperHourOf(day: number, tick: number): boolean {
  return tick % 24 === KEEPER_HOUR && dayOf(tick) === day;
}

/** A keeper rearranging the scape: every piece of hardscape lifted and set back fresh, every other plant uprooted. */
export function rescapeTank(state: SimulationState, config: TunableConfig): SimulationState {
  let next = resetHardscape(state);
  state.plants.forEach((plant, i) => {
    if (i % 2 === 0) next = applyAction(next, { type: 'removePlant', plantId: plant.id }, config).state;
  });
  return next;
}

export function dueActions(schedule: Schedule, state: SimulationState): Action[] {
  if (state.tick % 24 !== KEEPER_HOUR) return [];
  const day = dayOf(state.tick);
  return schedule
    .filter(({ every }) => day % every === 0)
    .map(({ action }) => toAction(action, state))
    .filter((action) => action !== null);
}

type ScheduleFlag = { every: number } & (
  | { chore: Chore }
  | { type: Chore['type']; units: Record<string, (amount: number) => Chore> }
);

const SCHEDULE_FLAGS: Record<string, ScheduleFlag> = {
  feed: {
    every: DAILY,
    type: 'feed',
    units: {
      g: (amount) => ({ type: 'feed', amount }),
      '%': (percent) => ({ type: 'feed', shareOfStock: percent / 100 }),
    },
  },
  'water-change': {
    every: WEEKLY,
    type: 'waterChange',
    units: {
      '%': (percent) => {
        if (percent > 100) throw new Error(`--water-change can't swap more than 100%, got ${percent}%.`);
        return { type: 'waterChange', amount: percent / 100 };
      },
    },
  },
  dose: { every: WEEKLY, type: 'dose', units: { ml: (amountMl) => ({ type: 'dose', amountMl }) } },
  trim: { every: WEEKLY, chore: { type: 'trimPlants', targetSize: TRIM_TARGET } },
  scrub: { every: WEEKLY, chore: { type: 'scrubAlgae' } },
  'top-off': { every: DAILY, chore: { type: 'topOff' } },
};

export const SCHEDULE_FLAG_NAMES = Object.keys(SCHEDULE_FLAGS);

export interface ScheduleOverride {
  type: Chore['type'];
  entry: ScheduleEntry | null;
}

function period(raw: string, flag: string): number {
  const match = /^(\d+)([dw])$/.exec(raw);
  const days = match === null ? 0 : Number(match[1]) * (match[2] === 'w' ? 7 : 1);
  if (days < 1) throw new Error(`--${flag} period must be <n>d or <n>w, at least a day; got "${raw}".`);
  return days;
}

function amount(units: Record<string, (amount: number) => Chore>, raw: string, flag: string): Chore {
  const match = /^(\d+(?:\.\d+)?)([a-z%]+)$/.exec(raw);
  const make = match !== null && Object.hasOwn(units, match[2]!) ? units[match[2]!] : undefined;
  const value = Number(match?.[1]);
  if (make === undefined || !(value > 0)) {
    throw new Error(`--${flag} takes a positive amount in ${Object.keys(units).join(' or ')}, got "${raw}".`);
  }
  return make(value);
}

export function parseScheduleFlag(flag: string, value: string | undefined): ScheduleOverride | null {
  if (!Object.hasOwn(SCHEDULE_FLAGS, flag)) return null;
  const spec = SCHEDULE_FLAGS[flag]!;
  const type = 'chore' in spec ? spec.chore.type : spec.type;
  if (value === 'off') return { type, entry: null };
  if ('chore' in spec) {
    return { type, entry: { every: value === undefined ? spec.every : period(value, flag), action: spec.chore } };
  }
  const [raw = '', every, ...extra] = (value ?? '').split('/');
  if (extra.length > 0) throw new Error(`--${flag} takes <amount>[/<period>], got "${value}".`);
  return {
    type,
    entry: { every: every === undefined ? spec.every : period(every, flag), action: amount(spec.units, raw, flag) },
  };
}

export function withOverride(schedule: Schedule, { type, entry }: ScheduleOverride): Schedule {
  const at = schedule.findIndex((e) => e.action.type === type);
  const rest = schedule.filter((e) => e.action.type !== type);
  if (entry === null) return rest;
  return at === -1 ? [...rest, entry] : [...rest.slice(0, at), entry, ...rest.slice(at)];
}
