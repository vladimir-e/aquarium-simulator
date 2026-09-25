import { describe, it, expect } from 'vitest';
import {
  MW_N,
  MW_NH3,
  MW_NO2,
  MW_NO3,
  MW_O2,
  MW_CO2,
  N_TO_NH3_MASS_RATIO,
  NH3_TO_NO2_MASS_RATIO,
  NO2_TO_NO3_MASS_RATIO,
  CO2_TO_O2_MASS_RATIO,
  O2_TO_CO2_MASS_RATIO,
  O2_PER_NH3_OXIDIZED,
  O2_PER_NO2_OXIDIZED,
} from './chemistry.js';

const asNitrogen = (mass: number, molecularWeight: number): number =>
  (mass * MW_N) / molecularWeight;

describe('a mass ratio is one mole of the named compound to one mole of the other', () => {
  it('holds for every pair the module names', () => {
    expect(N_TO_NH3_MASS_RATIO).toBeCloseTo(MW_NH3 / MW_N, 12);
    expect(NH3_TO_NO2_MASS_RATIO).toBeCloseTo(MW_NO2 / MW_NH3, 12);
    expect(NO2_TO_NO3_MASS_RATIO).toBeCloseTo(MW_NO3 / MW_NO2, 12);
    expect(CO2_TO_O2_MASS_RATIO).toBeCloseTo(MW_O2 / MW_CO2, 12);
  });

  it('reads the same reaction backwards as the reciprocal', () => {
    expect(CO2_TO_O2_MASS_RATIO * O2_TO_CO2_MASS_RATIO).toBeCloseTo(1, 12);
  });

  it('carries every nitrogen atom the whole length of the chain', () => {
    const ammonia = 1;
    const nitrite = ammonia * NH3_TO_NO2_MASS_RATIO;
    const nitrate = nitrite * NO2_TO_NO3_MASS_RATIO;
    const nitrogen = asNitrogen(ammonia, MW_NH3);

    expect(asNitrogen(nitrite, MW_NO2)).toBeCloseTo(nitrogen, 12);
    expect(asNitrogen(nitrate, MW_NO3)).toBeCloseTo(nitrogen, 12);
  });
});

describe('the oxygen nitrification pays, per gram of nitrogen', () => {
  it('spends the 3.43 mg the wastewater texts quote on the first step', () => {
    expect(O2_PER_NH3_OXIDIZED / asNitrogen(1, MW_NH3)).toBeCloseTo(3.43, 2);
  });

  it('spends their 1.14 mg on the second', () => {
    expect(O2_PER_NO2_OXIDIZED / asNitrogen(1, MW_NO2)).toBeCloseTo(1.14, 2);
  });

  it('spends their 4.57 mg carrying it the whole way', () => {
    const ammonia = 1;
    const firstStep = ammonia * O2_PER_NH3_OXIDIZED;
    const secondStep = ammonia * NH3_TO_NO2_MASS_RATIO * O2_PER_NO2_OXIDIZED;

    expect((firstStep + secondStep) / asNitrogen(ammonia, MW_NH3)).toBeCloseTo(4.57, 2);
  });

  it('spends three quarters of it before the nitrite exists', () => {
    const firstStep = O2_PER_NH3_OXIDIZED;
    const secondStep = NH3_TO_NO2_MASS_RATIO * O2_PER_NO2_OXIDIZED;

    expect(firstStep / (firstStep + secondStep)).toBeCloseTo(0.75, 12);
  });
});

describe('the photosynthetic pair', () => {
  it('matches the moles either way round, whatever mass is put through it', () => {
    for (const co2 of [0.5, 30, 1440]) {
      const oxygen = co2 * CO2_TO_O2_MASS_RATIO;

      expect(oxygen / MW_O2).toBeCloseTo(co2 / MW_CO2, 12);
      expect(oxygen * O2_TO_CO2_MASS_RATIO).toBeCloseTo(co2, 10);
    }
  });
});
