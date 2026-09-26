import { describe, it, expect } from 'vitest';
import {
  bandComfort,
  computeVitality,
  eFoldsPast,
  eFoldsUnder,
  hardened,
  shortfall,
  type VitalityFactor,
  type VitalityInput,
} from './vitality.js';

function stressor(key: string, amount: number, label = key): VitalityFactor {
  return { key, label, amount };
}

function benefit(key: string, amount: number, label = key): VitalityFactor {
  return { key, label, amount };
}

const CAP = 50;

function input(partial: Partial<VitalityInput> & Pick<VitalityInput, 'condition'>): VitalityInput {
  return {
    stressors: [],
    benefits: [],
    surplus: 0,
    surplusCap: CAP,
    healingRate: 0.05,
    ...partial,
  };
}

describe('computeVitality', () => {
  it('adds benefits and subtracts stressors from condition', () => {
    const result = computeVitality(
      input({ stressors: [stressor('temp', 1.0)], benefits: [benefit('food', 0.4)], condition: 80 })
    );
    expect(result.breakdown.net).toBeCloseTo(-0.6, 12);
    expect(result.newCondition).toBeCloseTo(79.4, 12);
  });

  it('never lets damage reach the bank: only the heal draws it, however hard the hit', () => {
    for (const damage of [0.5, 5, 500]) {
      const result = computeVitality(
        input({ stressors: [stressor('ph', damage)], condition: 100, surplus: 20, healingRate: 0.1 })
      );
      expect(result.surplus).toBeCloseTo(20 - result.breakdown.healed, 12);
      expect(result.breakdown.healed).toBeLessThanOrEqual(0.1 * 20 + 1e-12);
    }
  });

  it('heals min(deficit, share × bank) below 100', () => {
    const shallow = computeVitality(
      input({ stressors: [stressor('a', 0.5)], condition: 100, surplus: 20, healingRate: 0.1 })
    );
    expect(shallow.breakdown.healed).toBeCloseTo(0.5, 12);
    expect(shallow.newCondition).toBeCloseTo(100, 12);

    const deep = computeVitality(input({ condition: 60, surplus: 20, healingRate: 0.1 }));
    expect(deep.breakdown.healed).toBeCloseTo(2, 12);
    expect(deep.newCondition).toBeCloseTo(62, 12);
    expect(deep.surplus).toBeCloseTo(18, 12);
  });

  it('heals in proportion to the bank', () => {
    const heal = (surplus: number): number =>
      computeVitality(input({ condition: 50, surplus, healingRate: 0.05 })).breakdown.healed;
    expect(heal(20)).toBeCloseTo(2 * heal(10), 12);
  });

  it('banks only the income that overflows 100, up to the cap', () => {
    const recovering = computeVitality(input({ benefits: [benefit('b', 3)], condition: 99, surplus: 10 }));
    expect(recovering.newCondition).toBe(100);
    expect(recovering.breakdown.banked).toBeCloseTo(2, 12);
    expect(recovering.surplus).toBeCloseTo(12, 12);

    const nearlyFull = computeVitality(input({ benefits: [benefit('b', 5)], condition: 100, surplus: 48 }));
    expect(nearlyFull.surplus).toBe(CAP);
    expect(nearlyFull.breakdown.banked).toBe(2);
  });

  it('clamps the bank into [0, cap] on entry, reading a negative cap as 0', () => {
    expect(computeVitality(input({ condition: 100, surplus: 80 })).surplus).toBe(CAP);
    expect(computeVitality(input({ condition: 100, surplus: -5 })).surplus).toBe(0);
    expect(computeVitality(input({ benefits: [benefit('b', 5)], condition: 100, surplus: 8, surplusCap: -10 })).surplus).toBe(0);
  });

  it('floors condition at 0', () => {
    const result = computeVitality(input({ stressors: [stressor('lethal', 50)], condition: 5, surplus: 10 }));
    expect(result.newCondition).toBe(0);
  });

  it('holds the bank share within [0, 1]', () => {
    const result = computeVitality(input({ condition: 10, surplus: 20, healingRate: 3 }));
    expect(result.surplus).toBe(0);
    expect(result.newCondition).toBe(30);
  });

  it('keeps every factor in the breakdown, zero amounts included', () => {
    const result = computeVitality(
      input({ stressors: [stressor('a', 1), stressor('quiet', 0)], benefits: [benefit('c', 3)], condition: 80 })
    );
    expect(result.breakdown.stressors.map((f) => f.key)).toEqual(['a', 'quiet']);
    expect(result.breakdown.damageRate).toBe(1);
    expect(result.breakdown.benefitRate).toBe(3);
  });
});

describe('hardened', () => {
  const temp = [stressor('temp', 4)];

  it('scales every factor by one minus hardiness', () => {
    expect(hardened(temp, 0)[0].amount).toBe(4);
    expect(hardened(temp, 0.5)[0].amount).toBe(2);
    expect(hardened(temp, 1)[0].amount).toBe(0);
  });

  it('clamps hardiness into [0, 1]', () => {
    expect(hardened(temp, 1.5)[0].amount).toBe(0);
    expect(hardened(temp, -0.5)[0].amount).toBe(4);
  });
});

describe('eFoldsPast', () => {
  it('is zero up to the edge and the log of the ratio past it', () => {
    expect(eFoldsPast(3, 4)).toBe(0);
    expect(eFoldsPast(4, 4)).toBe(0);
    expect(eFoldsPast(4 * Math.E, 4)).toBeCloseTo(1, 12);
  });

  it('adds the same amount for every doubling, wherever it starts', () => {
    expect(eFoldsPast(160, 80) - eFoldsPast(80, 80)).toBeCloseTo(eFoldsPast(640, 80) - eFoldsPast(320, 80), 12);
  });
});

describe('eFoldsUnder', () => {
  it('is zero at or above the edge and the log of the offset ratio under it', () => {
    expect(eFoldsUnder(5, 4, 0.1)).toBe(0);
    expect(eFoldsUnder(4, 4, 0.1)).toBe(0);
    expect(eFoldsUnder(4.1 / Math.E - 0.1, 4, 0.1)).toBeCloseTo(1, 12);
  });

  it('stays finite at zero and still rises toward it', () => {
    expect(Number.isFinite(eFoldsUnder(0, 4, 0.1))).toBe(true);
    expect(eFoldsUnder(0, 4, 0.1)).toBeGreaterThan(eFoldsUnder(0.05, 4, 0.1));
    expect(eFoldsUnder(0.05, 4, 0.1)).toBeGreaterThan(eFoldsUnder(0.1, 4, 0.1));
  });
});

describe('shortfall', () => {
  it('is 0 at or over the edge, 1 at nothing, and linear between', () => {
    expect(shortfall(2, 1)).toBe(0);
    expect(shortfall(1, 1)).toBe(0);
    expect(shortfall(0, 1)).toBe(1);
    expect(shortfall(0.25, 1)).toBeCloseTo(0.75, 12);
  });

  it('asks nothing of an edge at 0', () => {
    expect(shortfall(0, 0)).toBe(0);
  });
});

describe('bandComfort', () => {
  const band = [20, 28] as const;

  it('is zero at both edges and outside, and one at the centre', () => {
    expect(bandComfort(20, band)).toBe(0);
    expect(bandComfort(28, band)).toBe(0);
    expect(bandComfort(15, band)).toBe(0);
    expect(bandComfort(35, band)).toBe(0);
    expect(bandComfort(24, band)).toBe(1);
  });

  it('leaves each edge continuously and is symmetric about the centre', () => {
    expect(bandComfort(20 + 1e-9, band)).toBeLessThan(1e-9);
    expect(bandComfort(22, band)).toBeCloseTo(bandComfort(26, band), 12);
    expect(bandComfort(22, band)).toBeCloseTo(0.75, 12);
  });

  it('earns nothing from a band with no width', () => {
    expect(bandComfort(5, [5, 5])).toBe(0);
  });
});
