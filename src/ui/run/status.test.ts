import { describe, it, expect } from 'vitest';
import type { VitalityResult } from '../../simulation/index.js';
import {
  conditionWord,
  groupReading,
  vitalReading,
  worstMember,
  type Member,
  type Reading,
} from './status.js';

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

  it('never shows a band the condition has not reached, whichever way it moves', () => {
    for (const edge of [10, 30, 60, 80, 100]) {
      for (const change of [-0.1, 0, 0.1]) {
        const condition = edge - 0.4;
        const vital = vitalReading(condition, heading(condition, condition + change));

        expect(Number(vital.value)).toBeLessThan(edge);
        expect(conditionWord(Number(vital.value))).toBe(conditionWord(condition));
      }
    }
  });

  it('lets a condition worse than sick speak for itself', () => {
    expect(vitalReading(20, heading(20, 19)).reading).toEqual({ status: 'alert', word: 'struggling' });
  });
});

const thriving: Reading = { status: 'ok', word: 'thriving' };
const good: Reading = { status: 'ok', word: 'good' };
const fair: Reading = { status: 'warn', word: 'fair' };
const sick: Reading = { status: 'warn', word: 'sick' };
const struggling: Reading = { status: 'alert', word: 'struggling' };

function members(...list: [number, Reading][]): Member[] {
  return list.map(([condition, reading]) => ({ condition, reading }));
}

describe('groupReading', () => {
  it('reads the worst member’s condition where nobody needs the reader, not the mean', () => {
    expect(groupReading(members([100, thriving], [100, thriving], [65, good]))).toEqual(good);
  });

  it('counts every member at the worst tone, so the count is the dots it sits over', () => {
    expect(groupReading(members([100, sick], [50, fair], [100, sick]))).toEqual({
      status: 'warn',
      word: '3 unwell',
    });
    expect(groupReading(members([20, struggling], [50, fair], [100, sick]))).toEqual({
      status: 'alert',
      word: '1 struggling',
    });
  });

  it('names the reason where the flagged members share one', () => {
    expect(groupReading(members([100, sick], [100, thriving], [100, sick]))).toEqual({
      status: 'warn',
      word: '2 sick',
    });
  });

  it('reads a group of one as its member', () => {
    expect(groupReading(members([100, sick]))).toEqual(sick);
  });
});

describe('worstMember', () => {
  it('is the most urgent member, and of those the lowest condition, wherever it stands', () => {
    const calm = members([100, thriving], [100, thriving], [65, good]);
    const flagged = members([90, sick], [20, struggling], [45, fair], [15, struggling]);

    expect(worstMember(calm)).toBe(calm[2]);
    expect(worstMember(flagged)).toBe(flagged[3]);
  });
});
