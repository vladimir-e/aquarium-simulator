import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { applyConfigSet } from '../config-set.js';

describe('config set', () => {
  it('writes a finite number to a path that names one', () => {
    const next = applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.02');
    expect(next.optics.waterAttenuationPerCm).toBe(0.02);
  });

  it('reads an exponent as the number it is', () => {
    const next = applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '1e-3');
    expect(next.optics.waterAttenuationPerCm).toBe(0.001);
  });

  it('walks a path past its first section', () => {
    const next = applyConfigSet(DEFAULT_CONFIG, 'nutrients.fertilizerFormula.nitrate', '60');
    expect(next.nutrients.fertilizerFormula.nitrate).toBe(60);
  });

  // `Number('Infinity')` is a number, so a naive numeric branch lets these
  // through and the engine multiplies by them.
  it.each(['Infinity', '-Infinity', 'NaN', '1e309', '-1e309'])(
    'refuses %s rather than storing it as a string',
    (raw) => {
      expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', raw)).toThrow(
        /requires a finite number/
      );
    }
  );

  it.each(['', '   ', 'true', 'false', 'fast', '[1,2]', '{"a":1}', '0x'])(
    'refuses %s, which is not a number at all',
    (raw) => {
      expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', raw)).toThrow(
        /requires a finite number/
      );
    }
  );

  it('refuses a path that names nothing, rather than growing the config a key', () => {
    expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.attenuation', '0.02')).toThrow(
      /Unknown config path "optics.attenuation"/
    );
    expect(() => applyConfigSet(DEFAULT_CONFIG, 'optiks.waterAttenuationPerCm', '0.02')).toThrow(
      /Unknown config path/
    );
    expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.a.b.c', '0.02')).toThrow(
      /Unknown config path/
    );
  });

  it('refuses a path that stops on a section', () => {
    expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics', '0.02')).toThrow(/Unknown config path/);
  });

  it('walks own keys only, so a prototype path names nothing', () => {
    expect(() => applyConfigSet(DEFAULT_CONFIG, '__proto__.pwned', '5')).toThrow(
      /Unknown config path/
    );
    expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.constructor.prototype.pwned', '5')).toThrow(
      /Unknown config path/
    );
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });

  describe('declared ranges', () => {
    it('refuses a negative attenuation, which would make light grow with depth', () => {
      expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '-100')).toThrow(
        /takes 0.001 to 0.05, got -100/
      );
    });

    it('refuses a value above the range and names it', () => {
      expect(() =>
        applyConfigSet(DEFAULT_CONFIG, 'nutrients.fertilizerFormula.nitrate', '500')
      ).toThrow(/nutrients.fertilizerFormula.nitrate takes 1 to 100, got 500/);
    });

    it('takes the bounds themselves', () => {
      expect(
        applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.05').optics
          .waterAttenuationPerCm
      ).toBe(0.05);
      expect(
        applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.001').optics
          .waterAttenuationPerCm
      ).toBe(0.001);
    });

    it('takes any finite number where the meta declares no range', () => {
      const next = applyConfigSet(DEFAULT_CONFIG, 'nitrogenCycle.bacteriaPerCm2', '260');
      expect(next.nitrogenCycle.bacteriaPerCm2).toBe(260);
    });
  });

  it('leaves the config it was given untouched', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.02');
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
});
