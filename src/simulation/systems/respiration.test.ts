import { describe, it, expect } from 'vitest';
import { getRespirationTemperatureFactor } from './respiration.js';
import { plantsDefaults } from '../config/plants.js';

describe('getRespirationTemperatureFactor', () => {
  const { respirationQ10: q10, respirationReferenceTemp: ref } = plantsDefaults;

  it('is 1 at the reference temperature and q10 per 10 °C either way', () => {
    expect(getRespirationTemperatureFactor(ref)).toBeCloseTo(1, 10);
    expect(getRespirationTemperatureFactor(ref + 10)).toBeCloseTo(q10, 10);
    expect(getRespirationTemperatureFactor(ref - 30)).toBeCloseTo(q10 ** -3, 10);
  });

  it('reads the reference and q10 off the config', () => {
    const custom = { ...plantsDefaults, respirationReferenceTemp: 20, respirationQ10: 3 };
    expect(getRespirationTemperatureFactor(20, custom)).toBeCloseTo(1, 10);
    expect(getRespirationTemperatureFactor(30, custom)).toBeCloseTo(3, 10);
  });
});
