import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  cloneConfig,
  isModified,
  isSectionModified,
  isConfigModified,
  decayDefaults,
  nitrogenCycleDefaults,
  gasExchangeDefaults,
  temperatureDefaults,
  evaporationDefaults,
  algaeDefaults,
  phDefaults,
} from './index.js';

describe('DEFAULT_CONFIG', () => {
  it('contains all 7 system configs', () => {
    expect(DEFAULT_CONFIG.decay).toBeDefined();
    expect(DEFAULT_CONFIG.nitrogenCycle).toBeDefined();
    expect(DEFAULT_CONFIG.gasExchange).toBeDefined();
    expect(DEFAULT_CONFIG.temperature).toBeDefined();
    expect(DEFAULT_CONFIG.evaporation).toBeDefined();
    expect(DEFAULT_CONFIG.algae).toBeDefined();
    expect(DEFAULT_CONFIG.ph).toBeDefined();
  });

  it('uses the correct defaults for each system', () => {
    expect(DEFAULT_CONFIG.decay).toEqual(decayDefaults);
    expect(DEFAULT_CONFIG.nitrogenCycle).toEqual(nitrogenCycleDefaults);
    expect(DEFAULT_CONFIG.gasExchange).toEqual(gasExchangeDefaults);
    expect(DEFAULT_CONFIG.temperature).toEqual(temperatureDefaults);
    expect(DEFAULT_CONFIG.evaporation).toEqual(evaporationDefaults);
    expect(DEFAULT_CONFIG.algae).toEqual(algaeDefaults);
    expect(DEFAULT_CONFIG.ph).toEqual(phDefaults);
  });
});

describe('cloneConfig', () => {
  it('creates a deep copy', () => {
    const clone = cloneConfig(DEFAULT_CONFIG);
    expect(clone).toEqual(DEFAULT_CONFIG);
    expect(clone).not.toBe(DEFAULT_CONFIG);
    expect(clone.decay).not.toBe(DEFAULT_CONFIG.decay);
  });

  it('changes to clone do not affect original', () => {
    const clone = cloneConfig(DEFAULT_CONFIG);
    clone.decay.q10 = 999;
    expect(DEFAULT_CONFIG.decay.q10).not.toBe(999);
  });
});

describe('isModified', () => {
  it('returns false for default values', () => {
    expect(isModified(DEFAULT_CONFIG, 'decay', 'q10')).toBe(false);
    expect(isModified(DEFAULT_CONFIG, 'temperature', 'coolingCoefficient')).toBe(false);
  });

  it('returns true for modified values', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    expect(isModified(modified, 'decay', 'q10')).toBe(true);
  });

  it('returns false for other values when one is modified', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    expect(isModified(modified, 'decay', 'baseDecayRate')).toBe(false);
  });
});

describe('isSectionModified', () => {
  it('returns false for default section', () => {
    expect(isSectionModified(DEFAULT_CONFIG, 'decay')).toBe(false);
    expect(isSectionModified(DEFAULT_CONFIG, 'ph')).toBe(false);
  });

  it('returns true when any value in section is modified', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    expect(isSectionModified(modified, 'decay')).toBe(true);
  });

  it('returns false for other sections when one is modified', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    expect(isSectionModified(modified, 'temperature')).toBe(false);
  });
});

describe('isConfigModified', () => {
  it('returns false for default config', () => {
    expect(isConfigModified(DEFAULT_CONFIG)).toBe(false);
  });

  it('returns true when any value is modified', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    expect(isConfigModified(modified)).toBe(true);
  });

  it('returns true when values in different sections are modified', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    modified.ph.neutralPh = 6.5;
    expect(isConfigModified(modified)).toBe(true);
  });
});

describe('decayDefaults', () => {
  it('has expected values', () => {
    expect(decayDefaults.q10).toBe(2.0);
    expect(decayDefaults.referenceTemp).toBe(25.0);
    expect(decayDefaults.baseDecayRate).toBe(0.05);
    expect(decayDefaults.wasteConversionRatio).toBe(0.4);
    expect(decayDefaults.gasExchangePerGramDecay).toBe(250);
  });
});

describe('temperatureDefaults', () => {
  it('has expected values', () => {
    expect(temperatureDefaults.coolingCoefficient).toBe(0.132);
    expect(temperatureDefaults.referenceVolume).toBe(100);
    expect(temperatureDefaults.volumeExponent).toBeCloseTo(1 / 3);
  });
});

describe('algaeDefaults', () => {
  it('has expected values', () => {
    expect(algaeDefaults.maxGrowthRate).toBe(0.4);
    expect(algaeDefaults.halfSaturation).toBe(1.3);
    expect(algaeDefaults.algaeCap).toBe(100);
  });
});

describe('phDefaults', () => {
  it('has expected values', () => {
    expect(phDefaults.calciteTargetPh).toBe(8.0);
    expect(phDefaults.driftwoodTargetPh).toBe(6.0);
    expect(phDefaults.neutralPh).toBe(7.0);
    expect(phDefaults.basePgDriftRate).toBe(0.08);
  });
});
