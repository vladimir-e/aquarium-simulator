import { describe, it, expect } from 'vitest';
import { readWindow, readFilter, readTick, viewParams } from './params';
import type { TickRange } from './window';

const RANGE: TickRange = { minTick: 100, maxTick: 200 };

describe('readWindow / readFilter', () => {
  it('takes the params it knows', () => {
    expect(readWindow('24h')).toBe('24h');
    expect(readWindow('7d')).toBe('7d');
    expect(readFilter('user')).toBe('user');
    expect(readFilter('life')).toBe('life');
  });

  it('falls back to the whole run, unfiltered, on anything else', () => {
    expect(readWindow(null)).toBe('run');
    expect(readWindow('30d')).toBe('run');
    expect(readWindow('')).toBe('run');
    expect(readFilter(null)).toBe('all');
    expect(readFilter('sim')).toBe('all'); // a category, but not a chip
  });
});

describe('readTick', () => {
  it('parks on a tick inside the window', () => {
    expect(readTick('150', RANGE)).toBe(150);
  });

  it('follows the live edge at or past the newest tick', () => {
    expect(readTick('200', RANGE)).toBeNull();
    expect(readTick('9999', RANGE)).toBeNull();
  });

  it('clamps a tick from before the window to its oldest snapshot', () => {
    // A link into the whole run, opened with the 24h window: the cursor lands
    // on the earliest state the charts can draw rather than off the track.
    expect(readTick('4', RANGE)).toBe(100);
    expect(readTick('-30', RANGE)).toBe(100);
  });

  it('ignores everything that is not a whole tick', () => {
    expect(readTick(null, RANGE)).toBeNull();
    expect(readTick('', RANGE)).toBeNull();
    expect(readTick('   ', RANGE)).toBeNull();
    expect(readTick('soon', RANGE)).toBeNull();
    expect(readTick('150.5', RANGE)).toBeNull();
  });

  it('has nothing to park on before the run records a snapshot', () => {
    expect(readTick('150', null)).toBeNull();
  });
});

describe('viewParams', () => {
  it('spells out nothing for the default view', () => {
    expect(viewParams({ window: 'run', filter: 'all', tick: null })).toEqual({});
  });

  it('carries only what differs from the default', () => {
    expect(viewParams({ window: '24h', filter: 'all', tick: null })).toEqual({ window: '24h' });
    expect(viewParams({ window: 'run', filter: 'life', tick: null })).toEqual({ log: 'life' });
    expect(viewParams({ window: 'run', filter: 'all', tick: 0 })).toEqual({ tick: '0' });
  });

  it('round-trips a fully specified view', () => {
    const view = { window: '24h', filter: 'user', tick: 1584 } as const;
    const params = new globalThis.URLSearchParams(viewParams(view));
    expect(readWindow(params.get('window'))).toBe(view.window);
    expect(readFilter(params.get('log'))).toBe(view.filter);
    expect(readTick(params.get('tick'), { minTick: 1560, maxTick: 1622 })).toBe(view.tick);
  });
});
