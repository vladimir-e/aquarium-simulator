import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  cloneConfig,
  configRange,
  isModified,
  isSectionModified,
  isConfigModified,
  decayDefaults,
  nitrogenCycleDefaults,
  gasExchangeDefaults,
  temperatureDefaults,
  evaporationDefaults,
  algaeVitalityDefaults,
  opticsDefaults,
  phDefaults,
  plantsDefaults,
  nutrientsDefaults,
  livestockDefaults,
} from './index.js';
import { AIR_SATURATED_O2 } from './nitrogen-cycle.js';
import { monodFactor } from '../core/kinetics.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { nobProcessingRateMultiplier } from '../systems/nitrogen-cycle.js';
import { MW_N, MW_NH3, NH3_TO_NO2_MASS_RATIO } from '../core/chemistry.js';

describe('DEFAULT_CONFIG', () => {
  it('contains all 11 system configs', () => {
    expect(DEFAULT_CONFIG.decay).toBeDefined();
    expect(DEFAULT_CONFIG.nitrogenCycle).toBeDefined();
    expect(DEFAULT_CONFIG.gasExchange).toBeDefined();
    expect(DEFAULT_CONFIG.temperature).toBeDefined();
    expect(DEFAULT_CONFIG.evaporation).toBeDefined();
    expect(DEFAULT_CONFIG.algae).toBeDefined();
    expect(DEFAULT_CONFIG.optics).toBeDefined();
    expect(DEFAULT_CONFIG.ph).toBeDefined();
    expect(DEFAULT_CONFIG.plants).toBeDefined();
    expect(DEFAULT_CONFIG.nutrients).toBeDefined();
    expect(DEFAULT_CONFIG.livestock).toBeDefined();
  });

  it('uses the correct defaults for each system', () => {
    expect(DEFAULT_CONFIG.decay).toEqual(decayDefaults);
    expect(DEFAULT_CONFIG.nitrogenCycle).toEqual(nitrogenCycleDefaults);
    expect(DEFAULT_CONFIG.gasExchange).toEqual(gasExchangeDefaults);
    expect(DEFAULT_CONFIG.temperature).toEqual(temperatureDefaults);
    expect(DEFAULT_CONFIG.evaporation).toEqual(evaporationDefaults);
    expect(DEFAULT_CONFIG.algae).toEqual(algaeVitalityDefaults);
    expect(DEFAULT_CONFIG.optics).toEqual(opticsDefaults);
    expect(DEFAULT_CONFIG.ph).toEqual(phDefaults);
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

  it('reads the bounds the meta declares', () => {
    expect(configRange('optics.waterAttenuationPerCm')).toEqual({ min: 0.001, max: 0.05 });
    expect(configRange('nutrients.fertilizerFormula.nitrate')).toEqual({ min: 1, max: 100 });
  });

  it('answers nothing for a path the config does not have', () => {
    expect(configRange('optics.attenuation')).toBeUndefined();
    expect(configRange('optiks.waterAttenuationPerCm')).toBeUndefined();
    expect(configRange('__proto__.pwned')).toBeUndefined();
  });

  // A slider whose range excludes the shipped value cannot restore it: the
  // CLI refuses to set it back and the panel clamps it away on blur.
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

  // Nitrification rates come off doubling times and no bound was ever derived
  // for them, so `config set` has nothing to hold them to. Deriving bounds
  // turns this red — the gap is stated here rather than left to be discovered.
  // The two half-saturation constants are measured concentrations and came
  // with theirs.
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

/**
 * Every nitrifier rate is a Monod maximum, so the figure its comment quotes is
 * what the rate reads in air-saturated water rather than what the constant
 * holds. This is that arithmetic, run rather than retold: a constant that moves
 * without its quoted figure moving breaks it.
 */
describe('nitrogenCycleDefaults quoted in the water they were measured in', () => {
  const { aobOxygenHalfSaturation: aobK, nobOxygenHalfSaturation: nobK } = nitrogenCycleDefaults;
  const inAir = (halfSaturation: number): number => monodFactor(AIR_SATURATED_O2, halfSaturation);

  it('calls air-saturated water what the gas model calls it at the same temperature', () => {
    expect(AIR_SATURATED_O2).toBeCloseTo(
      calculateO2Saturation(nitrogenCycleDefaults.referenceTemp),
      6
    );
  });

  it('doubles AOB in 20 h and NOB in 36 h there', () => {
    expect(Math.LN2 / (nitrogenCycleDefaults.aobGrowthRate * inAir(aobK))).toBeCloseTo(20, 9);
    expect(Math.LN2 / (nitrogenCycleDefaults.nobGrowthRate * inAir(nobK))).toBeCloseTo(36, 9);
  });

  it('puts 2×10⁻¹³ g of ammonia through a cell an hour there', () => {
    expect(nitrogenCycleDefaults.bacteriaProcessingRate * inAir(aobK)).toBeCloseTo(0.0002, 12);
  });

  it('hands NOB the NH₃→NO₂ mass ratio and nothing else there', () => {
    // The multiplier carries each guild's own oxygen term so neither pays the
    // other's; what is left in the water both were measured in is the ratio.
    expect((nobProcessingRateMultiplier() * inAir(nobK)) / inAir(aobK)).toBeCloseTo(
      NH3_TO_NO2_MASS_RATIO,
      12
    );
  });

  it('keeps both half-saturation constants inside the published range, NOB above AOB', () => {
    expect(aobK).toBeGreaterThanOrEqual(0.3);
    expect(aobK).toBeLessThanOrEqual(0.6);
    expect(nobK).toBeGreaterThanOrEqual(0.6);
    expect(nobK).toBeLessThanOrEqual(1.5);
    expect(nobK).toBeGreaterThan(aobK);
  });
});

/**
 * Two livestock rates are Monod maxima as well, and neither is divided back up
 * by its factor the way the nitrifier rates above are. What decides that is
 * whether the constant quotes a single figure or a band: re-quoting a band would
 * move the livestock calibration to make nothing truer. It holds only while what
 * the tank reproduces is still inside the band, which is what this asserts.
 */
describe('livestockDefaults inside the bands that let them keep their haircut', () => {
  const inAir = monodFactor(
    AIR_SATURATED_O2,
    livestockDefaults.respirationOxygenHalfSaturation
  );

  it('breathes 0.2–0.5 mg O₂ per gram per hour in air-saturated water', () => {
    const reproduced = livestockDefaults.baseRespirationRate * inAir;
    expect(reproduced).toBeGreaterThanOrEqual(0.2);
    expect(reproduced).toBeLessThanOrEqual(0.5);
  });

  it('excretes 0.3–1.0 mg basal N per gram per day there', () => {
    const perDay = livestockDefaults.basalAmmoniaRate * inAir * 24;
    expect((perDay * MW_N) / MW_NH3).toBeGreaterThanOrEqual(0.3);
    expect((perDay * MW_N) / MW_NH3).toBeLessThanOrEqual(1.0);
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

describe('algaeVitalityDefaults', () => {
  it('has all required population knobs', () => {
    // Smoke check that the population config is wired in. Specific
    // numeric values are calibration-grade; spot-check a few that
    // anchor the spec.
    expect(algaeVitalityDefaults.hardiness).toBeGreaterThan(0);
    expect(algaeVitalityDefaults.hardiness).toBeLessThanOrEqual(1);
    expect(algaeVitalityDefaults.weaknessThreshold).toBeLessThan(
      algaeVitalityDefaults.suppressionThreshold
    );
    expect(algaeVitalityDefaults.algaeGrowthPerTickCap).toBeGreaterThan(0);
    expect(algaeVitalityDefaults.massPerSurplus).toBeGreaterThan(0);
    expect(algaeVitalityDefaults.lightExcessThreshold).toBeGreaterThan(0);
  });
});

describe('phDefaults', () => {
  it('has expected values', () => {
    expect(phDefaults.calciteTargetPh).toBe(8.0);
    expect(phDefaults.driftwoodTargetPh).toBe(6.0);
    expect(phDefaults.neutralPh).toBe(7.0);
    expect(phDefaults.basePgDriftRate).toBe(0.25);
  });
});
