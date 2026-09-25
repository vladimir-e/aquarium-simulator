import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { parseScenarioArgs } from '../scenarios/command.js';
import { findSetup } from '../scenarios/setups.js';
import { applyTweak, parseTweak } from '../scenarios/tweaks.js';

describe('scenario tweaks', () => {
  it('parses a planting with and without a size', () => {
    expect(parseTweak('plant', 'java_fern:10')).toEqual({ kind: 'plant', species: 'java_fern', count: 10 });
    expect(parseTweak('plant', 'anubias:2:80')).toEqual({
      kind: 'plant',
      species: 'anubias',
      count: 2,
      size: 80,
    });
  });

  it('defaults a count to one', () => {
    expect(parseTweak('fish', 'betta')).toEqual({ kind: 'fish', species: 'betta', count: 1 });
  });

  it('refuses an unknown species, a bad count and an unknown tweak', () => {
    expect(() => parseTweak('plant', 'kelp:3')).toThrow(/Unknown plant species "kelp"/);
    expect(() => parseTweak('fish', 'guppy:2.5')).toThrow(/whole number/);
    expect(() => parseTweak('fish', 'guppy:0')).toThrow(/positive/);
    expect(() => parseTweak('lights', '2')).toThrow(/Unknown tweak --lights/);
  });

  it('reads feeding as grams, with zero and --no-feed both stopping it', () => {
    expect(parseTweak('feed', '0.3')).toEqual({ kind: 'feed', grams: 0.3 });
    expect(parseTweak('feed', '0')).toEqual({ kind: 'feed', grams: 0 });
    expect(parseTweak('no-feed', undefined)).toEqual({ kind: 'feed', grams: 0 });
    expect(() => parseTweak('feed', '-1')).toThrow();
  });

  it('splits a config set at the first equals sign', () => {
    expect(parseTweak('set', 'plants.upkeepCost=0.2')).toEqual({
      kind: 'set',
      path: 'plants.upkeepCost',
      value: '0.2',
    });
    expect(() => parseTweak('set', 'plants.upkeepCost')).toThrow(/dotted.path/);
  });

  it('applies tweaks onto a setup without touching the original', () => {
    const base = findSetup('low-tech');
    const { setup, config } = [
      parseTweak('plant', 'java_fern:10'),
      parseTweak('light', '2'),
      parseTweak('gal', '30'),
      parseTweak('no-feed', undefined),
      parseTweak('uncycled', undefined),
      parseTweak('set', 'optics.waterAttenuationPerCm=0.02'),
    ].reduce(applyTweak, { setup: base, config: DEFAULT_CONFIG });

    expect(setup.plants.at(-1)).toEqual({ species: 'java_fern', count: 10, size: 50 });
    expect(setup.light?.par).toBe(base.light!.par * 2);
    expect(setup.gallons).toBe(30);
    expect(setup.routine.feed).toBe(0);
    expect(setup.cycled).toBe(false);
    expect(config.optics.waterAttenuationPerCm).toBe(0.02);
    expect(base.plants).toHaveLength(3);
    expect(DEFAULT_CONFIG.optics.waterAttenuationPerCm).not.toBe(0.02);
  });

  it('separates setup names, run flags and tweaks on the command line', () => {
    const args = parseScenarioArgs(['nano', '--days=300', '--trace=5', '--json=out.json', '--fish=guppy:3']);
    expect(args.names).toEqual(['nano']);
    expect(args.days).toBe(300);
    expect(args.traceDay).toBe(5);
    expect(args.json).toBe('out.json');
    expect(args.tweaks).toEqual([{ kind: 'fish', species: 'guppy', count: 3 }]);
    expect(() => parseScenarioArgs(['atlantis'])).toThrow(/Unknown setup/);
    expect(() => parseScenarioArgs(['--days=0'])).toThrow(/whole days/);
  });
});
