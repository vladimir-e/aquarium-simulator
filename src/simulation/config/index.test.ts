import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  cloneConfig,
  configRange,
  tunableAt,
  withTunable,
  isModified,
  isSectionModified,
  isConfigModified,
  countModified,
  decayDefaults,
  nitrogenCycleDefaults,
  gasExchangeDefaults,
  temperatureDefaults,
  evaporationDefaults,
  algaeVitalityDefaults,
  opticsDefaults,
  waterChemistryDefaults,
  plantsDefaults,
  nutrientsDefaults,
  livestockDefaults,
} from './index.js';
import { AIR_SATURATED_O2 } from './nitrogen-cycle.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';

describe('DEFAULT_CONFIG', () => {
  it('uses the correct defaults for each system', () => {
    expect(DEFAULT_CONFIG.decay).toEqual(decayDefaults);
    expect(DEFAULT_CONFIG.nitrogenCycle).toEqual(nitrogenCycleDefaults);
    expect(DEFAULT_CONFIG.gasExchange).toEqual(gasExchangeDefaults);
    expect(DEFAULT_CONFIG.temperature).toEqual(temperatureDefaults);
    expect(DEFAULT_CONFIG.evaporation).toEqual(evaporationDefaults);
    expect(DEFAULT_CONFIG.algae).toEqual(algaeVitalityDefaults);
    expect(DEFAULT_CONFIG.optics).toEqual(opticsDefaults);
    expect(DEFAULT_CONFIG.waterChemistry).toEqual(waterChemistryDefaults);
    expect(DEFAULT_CONFIG.plants).toEqual(plantsDefaults);
    expect(DEFAULT_CONFIG.nutrients).toEqual(nutrientsDefaults);
    expect(DEFAULT_CONFIG.livestock).toEqual(livestockDefaults);
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
    expect(isSectionModified(DEFAULT_CONFIG, 'waterChemistry')).toBe(false);
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

describe('countModified', () => {
  it('counts nothing on an untouched config', () => {
    expect(countModified(DEFAULT_CONFIG)).toBe(0);
  });

  it('counts each touched value once, across sections', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.decay.q10 = 3.0;
    modified.waterChemistry.calciteDissolutionRate = DEFAULT_CONFIG.waterChemistry.calciteDissolutionRate + 1;
    expect(countModified(modified)).toBe(2);
  });

  it('reaches the leaves of a nested value', () => {
    const modified = cloneConfig(DEFAULT_CONFIG);
    modified.nutrients.fertilizerFormula.nitrate += 1;
    modified.nutrients.fertilizerFormula.phosphate += 1;
    expect(countModified(modified)).toBe(2);
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
});

describe('configRange', () => {
  const leaves = (value: object, prefix = ''): Array<[string, number]> =>
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === 'object' && child !== null
        ? leaves(child, path)
        : [[path, child as number] as [string, number]];
    });

  const tunables = leaves(DEFAULT_CONFIG);
  const paths = tunables.map(([path]) => path);

  it('answers nothing for a path the config does not have', () => {
    expect(configRange('optics.attenuation')).toBeUndefined();
    expect(configRange('optiks.waterAttenuationPerCm')).toBeUndefined();
    expect(configRange('__proto__.pwned')).toBeUndefined();
  });

  it('brackets the shipped default of every tunable it bounds', () => {
    const excluded = tunables.filter(([path, value]) => {
      const range = configRange(path);
      return range !== undefined && (value < range.min || value > range.max);
    });
    expect(excluded).toEqual([]);
  });

  it('bounds every tunable outside the nitrogen cycle', () => {
    const unbounded = paths.filter(
      (path) => !path.startsWith('nitrogenCycle.') && configRange(path) === undefined
    );
    expect(unbounded).toEqual([]);
  });

  it('bounds the nitrogen cycle’s half-saturation constants and nothing else', () => {
    const bounded = paths.filter(
      (path) => path.startsWith('nitrogenCycle.') && configRange(path) !== undefined
    );
    expect(bounded).toEqual([
      'nitrogenCycle.aobOxygenHalfSaturation',
      'nitrogenCycle.nobOxygenHalfSaturation',
    ]);
  });
});

describe('AIR_SATURATED_O2', () => {
  it('calls air-saturated water what the gas model calls it at the same temperature', () => {
    expect(AIR_SATURATED_O2).toBeCloseTo(
      calculateO2Saturation(nitrogenCycleDefaults.referenceTemp),
      6
    );
  });
});

describe('tunableAt', () => {
  it('reads the leaf a dotted path names', () => {
    expect(tunableAt(DEFAULT_CONFIG, 'waterChemistry.calciteDissolutionRate')).toBe(
      DEFAULT_CONFIG.waterChemistry.calciteDissolutionRate
    );
  });

  it('names nothing numeric, and says so', () => {
    expect(tunableAt(DEFAULT_CONFIG, 'waterChemistry')).toBeUndefined();
    expect(tunableAt(DEFAULT_CONFIG, 'waterChemistry.nothing')).toBeUndefined();
    expect(tunableAt(DEFAULT_CONFIG, 'nothing.at.all')).toBeUndefined();
    expect(tunableAt(DEFAULT_CONFIG, 'toString')).toBeUndefined();
    expect(tunableAt(DEFAULT_CONFIG, 'constructor.name')).toBeUndefined();
  });
});

describe('withTunable', () => {
  it('sets the leaf and leaves the config it was given alone', () => {
    const was = DEFAULT_CONFIG.waterChemistry.calciteDissolutionRate;
    const next = withTunable(DEFAULT_CONFIG, 'waterChemistry.calciteDissolutionRate', 6.4);

    expect(tunableAt(next, 'waterChemistry.calciteDissolutionRate')).toBe(6.4);
    expect(DEFAULT_CONFIG.waterChemistry.calciteDissolutionRate).toBe(was);
    expect(next.temperature).toEqual(DEFAULT_CONFIG.temperature);
  });

  it('throws on a path that names no tunable, rather than writing one', () => {
    expect(() => withTunable(DEFAULT_CONFIG, 'waterChemistry.nothing', 1)).toThrow(
      'Unknown config path "waterChemistry.nothing".'
    );
    expect(() => withTunable(DEFAULT_CONFIG, 'waterChemistry', 1)).toThrow();
    expect(() => withTunable(DEFAULT_CONFIG, 'toString', 1)).toThrow();
  });
});
