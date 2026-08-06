import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { applyConfigSet } from '../sim.js';

describe('config set', () => {
  it('writes a finite number to a path that names one', () => {
    const next = applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.02');
    expect(next.optics.waterAttenuationPerCm).toBe(0.02);
    expect(DEFAULT_CONFIG.optics.waterAttenuationPerCm).not.toBe(0.02);
  });

  it('reads an exponent as the number it is', () => {
    const next = applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '1e-3');
    expect(next.optics.waterAttenuationPerCm).toBe(0.001);
  });

  // Each of these parses as a numeric literal but is not a finite number. The
  // old coercion demoted them to the raw string, which reaches the engine as a
  // string and turns the first product that touches it into NaN — the same
  // poisoned tank, wearing a different type.
  it.each(['Infinity', '-Infinity', 'NaN', '1e309', '-1e309'])(
    'refuses %s rather than storing it as a string',
    (raw) => {
      expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', raw)).toThrow(
        /requires a finite number/
      );
    }
  );

  it('refuses anything else that is not a number', () => {
    for (const raw of ['', '   ', 'true', 'false', 'fast', '[1,2]', '{"a":1}', '0x']) {
      expect(() => applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', raw)).toThrow(
        /requires a finite number/
      );
    }
  });

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

  it('leaves the config it was given untouched', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    applyConfigSet(DEFAULT_CONFIG, 'optics.waterAttenuationPerCm', '0.02');
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
});
