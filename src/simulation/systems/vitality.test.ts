import { describe, it, expect } from 'vitest';
import {
  bandComfort,
  computeVitality,
  bankSurplus,
  eFoldsPast,
  eFoldsUnder,
  hardened,
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
    ...partial,
  };
}

describe('computeVitality', () => {
  describe('empty input', () => {
    it('returns condition unchanged with zero surplus when nothing is happening', () => {
      const result = computeVitality(input({ condition: 80 }));
      expect(result.newCondition).toBe(80);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.damageRate).toBe(0);
      expect(result.breakdown.benefitRate).toBe(0);
      expect(result.breakdown.net).toBe(0);
      expect(result.breakdown.drained).toBe(0);
    });

    it('keeps full-condition organism at 100 with no surplus when idle', () => {
      const result = computeVitality(input({ condition: 100 }));
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });
  });

  describe('net-negative decline', () => {
    it('subtracts damage from condition when stressors dominate and the bank is empty', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('temp', 1.0)],
          benefits: [benefit('food', 0.5)],
          condition: 80,
        })
      );
      expect(result.breakdown.damageRate).toBeCloseTo(1.0, 6);
      expect(result.breakdown.benefitRate).toBeCloseTo(0.5, 6);
      expect(result.breakdown.net).toBeCloseTo(-0.5, 6);
      expect(result.newCondition).toBeCloseTo(79.5, 6);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.drained).toBe(0);
    });

    it('clamps newCondition at 0 when damage would push it below zero', () => {
      const result = computeVitality(
        input({ stressors: [stressor('lethal', 50)], condition: 5 })
      );
      expect(result.newCondition).toBe(0);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.damageRate).toBe(50);
    });
  });

  describe('surplus buffer — damage drains the bank before condition', () => {
    it('leaves condition untouched while the bank fully covers the damage', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('temp', 2.0)],
          condition: 100,
          surplus: 10,
        })
      );
      expect(result.breakdown.net).toBeCloseTo(-2.0, 6);
      expect(result.newCondition).toBe(100);
      expect(result.breakdown.drained).toBeCloseTo(2.0, 6);
      expect(result.surplus).toBeCloseTo(8.0, 6);
    });

    it('splits the hit when the bank is smaller than the damage', () => {
      const result = computeVitality(
        input({ stressors: [stressor('a', 3)], condition: 80, surplus: 1 })
      );
      expect(result.breakdown.drained).toBe(1);
      expect(result.surplus).toBe(0);
      expect(result.newCondition).toBeCloseTo(78, 6);
    });

    it('decline resumes exactly when the bank empties', () => {
      const tick1 = computeVitality(
        input({ stressors: [stressor('a', 1)], condition: 100, surplus: 1 })
      );
      expect(tick1.newCondition).toBe(100);
      expect(tick1.surplus).toBe(0);

      const tick2 = computeVitality(
        input({ stressors: [stressor('a', 1)], condition: 100, surplus: tick1.surplus })
      );
      expect(tick2.newCondition).toBeCloseTo(99, 6);
      expect(tick2.breakdown.drained).toBe(0);
    });

    it('a sub-100 organism with reserves has its condition protected too', () => {
      const result = computeVitality(
        input({ stressors: [stressor('a', 2)], condition: 60, surplus: 5 })
      );
      expect(result.newCondition).toBe(60);
      expect(result.surplus).toBe(3);
      expect(result.breakdown.drained).toBe(2);
    });
  });

  describe('saturation cap', () => {
    it('accrues up to the cap then discards the overflow', () => {
      const result = computeVitality(
        input({ benefits: [benefit('great', 5)], condition: 100, surplus: 49 })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(CAP);
    });

    it('accrues the full net when it fits under the cap', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('mild', 0.2)],
          benefits: [benefit('great', 2.5)],
          condition: 100,
          surplus: 0,
        })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBeCloseTo(2.3, 6);
    });

    it('surplus is unchanged when at 100% but net is non-positive', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('a', 0.5)],
          benefits: [benefit('b', 0.5)],
          condition: 100,
          surplus: 4,
        })
      );
      expect(result.breakdown.net).toBeCloseTo(0, 6);
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(4);
    });
  });

  describe('self-heal clamp on oversized banks', () => {
    it('clamps an over-cap bank down to the cap on an idle tick', () => {
      const result = computeVitality(input({ condition: 90, surplus: 80 }));
      expect(result.surplus).toBe(CAP);
      expect(result.newCondition).toBe(90);
    });

    it('clamps an over-cap bank while healing sub-100', () => {
      const result = computeVitality(
        input({ benefits: [benefit('boost', 3)], condition: 90, surplus: 200 })
      );
      expect(result.newCondition).toBe(93);
      expect(result.surplus).toBe(CAP);
    });
  });

  describe('net-positive recovery (sub-100)', () => {
    it('adds net to condition when below 100, bank idle', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('temp', 0.3)],
          benefits: [benefit('food', 1.5), benefit('oxygen', 0.5)],
          condition: 60,
          surplus: 7,
        })
      );
      expect(result.breakdown.net).toBeCloseTo(1.7, 6);
      expect(result.newCondition).toBeCloseTo(61.7, 6);
      expect(result.surplus).toBe(7);
    });

    it('clamps to 100 when recovery would overshoot; overshoot is not banked', () => {
      const result = computeVitality(
        input({ benefits: [benefit('all', 5)], condition: 99, surplus: 0 })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });

    it('does not accrue surplus while sub-100 even with strong benefits', () => {
      const result = computeVitality(
        input({ benefits: [benefit('boost', 3)], condition: 90, surplus: 2 })
      );
      expect(result.newCondition).toBe(93);
      expect(result.surplus).toBe(2);
    });
  });

  describe('accrual gating (accrueSurplus)', () => {
    it('discards positive overflow at full condition when accrual is gated off', () => {
      const result = computeVitality(
        input({
          benefits: [benefit('great', 3)],
          condition: 100,
          surplus: 10,
          accrueSurplus: false,
        })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(10);
    });

    it('still drains the bank to buffer damage when accrual is gated off', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('a', 2)],
          condition: 100,
          surplus: 5,
          accrueSurplus: false,
        })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(3);
      expect(result.breakdown.drained).toBe(2);
    });
  });

  describe('two claims on one bank, in an order', () => {
    const storing = (
      partial: Partial<VitalityInput> & Pick<VitalityInput, 'condition'>
    ): VitalityInput =>
      input({
        upkeep: [stressor('alive', 1)],
        upkeepReserveHours: 5,
        surplus: 20,
        ...partial,
      });

    it('lets upkeep spend the bank to the last unit', () => {
      const result = computeVitality(storing({ condition: 100, surplus: 3 }));

      expect(result.surplus).toBe(2);
      expect(result.breakdown.starved).toBe(0);
    });

    it('reports the share of the bill even the empty bank could not pay', () => {
      const result = computeVitality(storing({ condition: 100, surplus: 0.25 }));

      expect(result.surplus).toBe(0);
      expect(result.breakdown.starved).toBe(0.75);
    });

    it('buffers damage on the spare above the reserve, holding condition', () => {
      const result = computeVitality(
        storing({ benefits: [benefit('light', 4)], stressors: [stressor('ph', 6)], condition: 100 })
      );

      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(17);
      expect(result.breakdown.drained).toBe(3);
    });

    it('stops at the reserve and lets the rest reach condition', () => {
      const result = computeVitality(
        storing({
          benefits: [benefit('light', 4)],
          stressors: [stressor('ph', 6)],
          condition: 100,
          surplus: 6,
        })
      );

      expect(result.surplus).toBe(5);
      expect(result.breakdown.drained).toBe(1);
      expect(result.newCondition).toBe(98);
    });

    it('leaves the next hour of upkeep payable however hard the damage is', () => {
      const result = computeVitality(
        storing({
          benefits: [benefit('light', 4)],
          stressors: [stressor('ph', 500)],
          condition: 100,
        })
      );

      expect(result.breakdown.starved).toBe(0);
      expect(result.surplus).toBe(5);
      expect(result.newCondition).toBe(0);
    });

    it('banks its whole surplus at any condition, rather than healing on it', () => {
      const result = computeVitality(storing({ benefits: [benefit('light', 4)], condition: 40 }));

      expect(result.newCondition).toBe(40);
      expect(result.surplus).toBe(23);
    });

    it('reads the ledger off the array, not off what it sums to', () => {
      const earning = { benefits: [benefit('light', 4)], condition: 40 };

      for (const owes of [[], [stressor('alive', 0)]]) {
        const banked = computeVitality(storing({ ...earning, upkeep: owes }));
        expect(banked.newCondition).toBe(40);
        expect(banked.surplus).toBe(24);
      }

      const noLedger = computeVitality(
        input({ ...earning, upkeepReserveHours: 5, surplus: 20 })
      );
      expect(noLedger.newCondition).toBe(44);
      expect(noLedger.surplus).toBe(20);
    });
  });

  describe('breakdown shape', () => {
    it('preserves all factors in the breakdown for UI rendering', () => {
      const stressors = [stressor('a', 1), stressor('b', 2)];
      const benefits = [benefit('c', 3), benefit('d', 0.5)];
      const result = computeVitality(input({ stressors, benefits, condition: 80 }));
      expect(result.breakdown.stressors).toHaveLength(2);
      expect(result.breakdown.benefits).toHaveLength(2);
      expect(result.breakdown.stressors[0].amount).toBe(1);
      expect(result.breakdown.stressors[1].amount).toBe(2);
      expect(result.breakdown.benefits[0].amount).toBe(3);
      expect(result.breakdown.benefits[1].amount).toBe(0.5);
      expect(result.breakdown.stressors[0].key).toBe('a');
    });

    it('keeps zero-amount factors faithfully (caller decides filtering)', () => {
      const result = computeVitality(
        input({ stressors: [stressor('quiet', 0)], condition: 100 })
      );
      expect(result.breakdown.stressors).toHaveLength(1);
      expect(result.breakdown.stressors[0].amount).toBe(0);
    });
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

describe('bankSurplus', () => {
  it('accrues positive net up to the cap, discarding the overflow', () => {
    expect(bankSurplus(48, 5, CAP, true)).toEqual({ surplus: CAP, drained: 0, overflowDamage: 0 });
    expect(bankSurplus(10, 5, CAP, true)).toEqual({ surplus: 15, drained: 0, overflowDamage: 0 });
  });

  it('discards positive net entirely when accrual is gated off', () => {
    expect(bankSurplus(10, 5, CAP, false)).toEqual({ surplus: 10, drained: 0, overflowDamage: 0 });
  });

  it('drains the bank to absorb damage, reporting the shortfall', () => {
    expect(bankSurplus(1, -3, CAP, true)).toEqual({ surplus: 0, drained: 1, overflowDamage: 2 });
    expect(bankSurplus(10, -2, CAP, true)).toEqual({ surplus: 8, drained: 2, overflowDamage: 0 });
  });

  it('drains regardless of the accrual gate', () => {
    expect(bankSurplus(10, -2, CAP, false)).toEqual({ surplus: 8, drained: 2, overflowDamage: 0 });
  });

  it('clamps an over-cap bank down to the cap on entry', () => {
    expect(bankSurplus(80, 0, CAP, true).surplus).toBe(CAP);
    expect(bankSurplus(80, -2, CAP, true)).toEqual({ surplus: 48, drained: 2, overflowDamage: 0 });
  });

  it('clamps a negative bank up to zero', () => {
    expect(bankSurplus(-5, 0, CAP, true).surplus).toBe(0);
  });

  it('is a no-op on the bank when net is zero', () => {
    expect(bankSurplus(12, 0, CAP, true)).toEqual({ surplus: 12, drained: 0, overflowDamage: 0 });
  });

  it('treats a negative cap as zero across every branch', () => {
    expect(bankSurplus(8, 5, -10, true).surplus).toBe(0);
    expect(bankSurplus(8, -2, -10, true).surplus).toBe(0);
    expect(bankSurplus(8, 0, -10, true).surplus).toBe(0);
  });

  describe('a reserved depth a claim may not reach', () => {
    it('drains only the spare above it, overflowing the rest', () => {
      expect(bankSurplus(10, -9, CAP, true, 4)).toEqual({
        surplus: 4,
        drained: 6,
        overflowDamage: 3,
      });
    });

    it('spends nothing at or below the line', () => {
      expect(bankSurplus(4, -9, CAP, true, 4)).toEqual({
        surplus: 4,
        drained: 0,
        overflowDamage: 9,
      });
      expect(bankSurplus(2, -9, CAP, true, 4)).toEqual({
        surplus: 2,
        drained: 0,
        overflowDamage: 9,
      });
    });

    it('is a floor on spending, not a ceiling on saving', () => {
      expect(bankSurplus(10, 5, CAP, true, 40).surplus).toBe(15);
    });

    it('defaults to reserving nothing, and floors a negative reservation', () => {
      expect(bankSurplus(10, -9, CAP, true)).toEqual(bankSurplus(10, -9, CAP, true, 0));
      expect(bankSurplus(10, -9, CAP, true, -5)).toEqual(bankSurplus(10, -9, CAP, true, 0));
    });
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
