import { describe, it, expect } from 'vitest';
import type { VitalityResult } from '../../simulation/index.js';
import { vitalReading } from './status.js';

function heading(condition: number, newCondition: number): VitalityResult {
  const net = newCondition - condition;
  return {
    newCondition,
    surplus: 0,
    breakdown: {
      stressors: [],
      benefits: [],
      damageRate: Math.max(0, -net),
      benefitRate: Math.max(0, net),
      net,
      healed: 0,
      banked: 0,
    },
  };
}

describe('vitalReading', () => {
  it('reads a fall too small for the trend to show as neither sick nor falling', () => {
    const vital = vitalReading(100, heading(100, 100 - 0.0018));

    expect(vital).toMatchObject({ sick: false, value: '100', trend: 'steady' });
    expect(vital.reading.word).toBe('thriving');
  });

  it('is sick exactly while the trend shows a fall, at every rate', () => {
    for (let exponent = -6; exponent <= 0; exponent += 0.25) {
      for (const sign of [-1, 1]) {
        const vital = vitalReading(90, heading(90, 90 + sign * 10 ** exponent));

        expect(vital.sick).toBe(vital.trend.startsWith('↘'));
        expect(vital.sick).toBe(vital.reading.word === 'sick');
      }
    }
  });

  it('floors a falling condition, so it never rounds back up to where it was', () => {
    expect(vitalReading(99.75, heading(99.75, 99.7)).value).toBe('99');
    expect(vitalReading(99.75, heading(99.75, 99.8)).value).toBe('100');
  });

  it('lets a condition worse than sick speak for itself', () => {
    expect(vitalReading(20, heading(20, 19)).reading).toEqual({ status: 'alert', word: 'struggling' });
  });
});
