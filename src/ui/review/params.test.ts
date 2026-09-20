import { describe, it, expect } from 'vitest';
import { readWindow, readFilter, readTick, withParams } from './params';
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
    // on the earliest state the tracks can draw rather than off the axis.
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

describe('withParams', () => {
  const at = (query: string): globalThis.URLSearchParams => new globalThis.URLSearchParams(query);

  it('writes what it is given and leaves the rest of the address alone', () => {
    expect(withParams(at('add=fish'), { tick: '150' }).toString()).toBe('add=fish&tick=150');
  });

  it('drops a param a null names, which is how a default leaves the URL', () => {
    expect(withParams(at('window=24h&tick=150'), { window: null }).toString()).toBe('tick=150');
    expect(withParams(at('tick=150'), { tick: null }).toString()).toBe('');
  });

  it('round-trips a fully specified view', () => {
    const params = withParams(at(''), { window: '24h', log: 'user', tick: '1584' });
    expect(readWindow(params.get('window'))).toBe('24h');
    expect(readFilter(params.get('log'))).toBe('user');
    expect(readTick(params.get('tick'), { minTick: 1560, maxTick: 1622 })).toBe(1584);
  });
});
