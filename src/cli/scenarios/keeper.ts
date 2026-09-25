import type { Action, SimulationState } from '../../simulation/index.js';

export type Chore = Action | { type: 'feed'; shareOfStock: number };

export interface ScheduleEntry {
  every: number;
  action: Chore;
}

export type Schedule = ScheduleEntry[];

const KEEPER_HOUR = 19;

function toAction(chore: Chore, state: SimulationState): Action | null {
  if (!('shareOfStock' in chore)) return chore;
  const mass = state.fish.reduce((sum, fish) => sum + fish.mass, 0);
  const amount = Math.round(mass * chore.shareOfStock * 100) / 100;
  return amount > 0 ? { type: 'feed', amount } : null;
}

export function dueActions(schedule: Schedule, state: SimulationState): Action[] {
  if (state.tick % 24 !== KEEPER_HOUR) return [];
  const day = Math.floor(state.tick / 24) + 1;
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
    every: 1,
    type: 'feed',
    units: {
      g: (amount) => ({ type: 'feed', amount }),
      '%': (percent) => ({ type: 'feed', shareOfStock: percent / 100 }),
    },
  },
  'water-change': {
    every: 7,
    type: 'waterChange',
    units: {
      '%': (percent) => {
        if (percent > 100) throw new Error(`--water-change can't swap more than 100%, got ${percent}%.`);
        return { type: 'waterChange', amount: percent / 100 };
      },
    },
  },
  dose: { every: 7, type: 'dose', units: { ml: (amountMl) => ({ type: 'dose', amountMl }) } },
  trim: { every: 7, chore: { type: 'trimPlants', targetSize: 100 } },
  scrub: { every: 7, chore: { type: 'scrubAlgae' } },
  'top-off': { every: 1, chore: { type: 'topOff' } },
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
  const [raw = '', every] = (value ?? '').split('/');
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
