import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { parseScenarioArgs } from '../scenarios/command.js';
import { parseScheduleFlag, type ScheduleEntry } from '../scenarios/keeper.js';
import { findSetup, type Setup } from '../scenarios/setups.js';
import { parseTweak } from '../scenarios/tweaks.js';

const tweaked = (setup: Setup, ...args: string[]): Setup =>
  parseScenarioArgs(args).tweaks.reduce((tank, tweak) => tweak.apply(tank), { setup, config: DEFAULT_CONFIG })
    .setup;

describe('schedule flags', () => {
  it('reads an amount with its unit and an optional period', () => {
    expect(parseScheduleFlag('feed', '2g/1d')).toEqual({
      type: 'feed',
      entry: { every: 1, action: { type: 'feed', amount: 2 } },
    });
    expect(parseScheduleFlag('water-change', '50%/3d')?.entry).toEqual({
      every: 3,
      action: { type: 'waterChange', amount: 0.5 },
    });
    expect(parseScheduleFlag('dose', '3ml/2w')?.entry).toEqual({ every: 14, action: { type: 'dose', amountMl: 3 } });
  });

  it('falls back to the usual cadence, and feeds a share of stock mass on a percentage', () => {
    expect(parseScheduleFlag('feed', '3%')?.entry).toEqual({
      every: 1,
      action: { type: 'feed', shareOfStock: 0.03 },
    });
    expect(parseScheduleFlag('water-change', '25%')?.entry?.every).toBe(7);
    expect(parseScheduleFlag('trim', undefined)?.entry?.every).toBe(7);
  });

  it('takes only a period for an action without an amount', () => {
    expect(parseScheduleFlag('scrub', '3d')).toEqual({
      type: 'scrubAlgae',
      entry: { every: 3, action: { type: 'scrubAlgae' } },
    });
  });

  it('reads off as dropping the action', () => {
    expect(parseScheduleFlag('water-change', 'off')).toEqual({ type: 'waterChange', entry: null });
  });

  it('refuses a missing or wrong unit, a zero amount or period, a third segment, and over 100 %', () => {
    expect(() => parseScheduleFlag('feed', '2')).toThrow(/g or %/);
    expect(() => parseScheduleFlag('dose', '3g')).toThrow(/ml/);
    expect(() => parseScheduleFlag('feed', '0g')).toThrow(/positive/);
    expect(() => parseScheduleFlag('feed', '2g/0d')).toThrow(/at least a day/);
    expect(() => parseScheduleFlag('feed', '2g/1d/junk')).toThrow(/<amount>\[\/<period>\]/);
    expect(() => parseScheduleFlag('trim', 'weekly')).toThrow(/<n>d/);
    expect(() => parseScheduleFlag('water-change', '150%')).toThrow(/100%/);
  });

  it('leaves unknown flags to the caller', () => {
    expect(parseScheduleFlag('vacuum', '1d')).toBeNull();
    expect(parseScheduleFlag('toString', '1d')).toBeNull();
  });
});

describe('schedule overrides', () => {
  const base = findSetup('low-tech');
  const ofType = (setup: Setup, type: string): ScheduleEntry[] =>
    setup.schedule.filter((e) => e.action.type === type);

  it('replaces an action in place', () => {
    const setup = tweaked(base, '--feed=2g');
    expect(ofType(setup, 'feed')).toEqual([{ every: 1, action: { type: 'feed', amount: 2 } }]);
    expect(setup.schedule.findIndex((e) => e.action.type === 'feed')).toBe(
      base.schedule.findIndex((e) => e.action.type === 'feed')
    );
    expect(setup.schedule).toHaveLength(base.schedule.length);
  });

  it('drops an action on off, and adds one the setup lacks', () => {
    const setup = tweaked(base, '--water-change=off', '--top-off=off');
    expect(ofType(setup, 'waterChange')).toEqual([]);
    expect(setup.schedule).toHaveLength(base.schedule.length - 2);
    expect(ofType(tweaked(findSetup('low-flow'), '--dose=2ml'), 'dose')).toHaveLength(1);
  });

  it('composes by repetition, in order', () => {
    expect(ofType(tweaked(base, '--feed=off', '--feed=1g'), 'feed')).toHaveLength(1);
    expect(ofType(tweaked(base, '--feed=1g', '--feed=off'), 'feed')).toHaveLength(0);
  });

  it('leaves the preset untouched', () => {
    const before = base.schedule.length;
    tweaked(base, '--feed=off');
    expect(base.schedule).toHaveLength(before);
  });
});

describe('scenario arguments', () => {
  it('separates setups, run flags and tweaks', () => {
    const args = parseScenarioArgs(['nano', '--days=300', '--trace=5', '--json=out.json', '--fish=guppy:3']);
    expect(args.setups.map((s) => s.name)).toEqual(['nano']);
    expect(args.days).toBe(300);
    expect(args.traceDay).toBe(5);
    expect(args.json).toBe('out.json');
    expect(args.tweaks.map((t) => t.text)).toEqual(['--fish=guppy:3']);
  });

  it('refuses an unknown setup, a duplicate setup, an empty --json= and bad days', () => {
    expect(() => parseScenarioArgs(['atlantis'])).toThrow(/Unknown setup/);
    expect(() => parseScenarioArgs(['nano', 'nano'])).toThrow(/twice/);
    expect(() => parseScenarioArgs(['--json='])).toThrow(/file name/);
    expect(() => parseScenarioArgs(['--days=0'])).toThrow(/whole days/);
  });

  it('refuses inherited object keys as species', () => {
    expect(() => parseTweak('fish', 'toString')).toThrow(/Unknown fish species/);
    expect(() => parseTweak('plant', '__proto__')).toThrow(/Unknown plant species/);
  });
});
