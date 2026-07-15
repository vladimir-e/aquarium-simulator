import { describe, it, expect } from 'vitest';
import {
  computeVitality,
  bankSurplus,
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

/**
 * Build a `VitalityInput` with an empty bank and the default cap, so a
 * test only spells out the fields it cares about. `surplus` and
 * `surplusCap` default to 0 / CAP; pass overrides to exercise the buffer.
 */
function input(partial: Partial<VitalityInput> & Pick<VitalityInput, 'hardiness' | 'condition'>): VitalityInput {
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
      const result = computeVitality(input({ hardiness: 0.5, condition: 80 }));
      expect(result.newCondition).toBe(80);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.damageRate).toBe(0);
      expect(result.breakdown.benefitRate).toBe(0);
      expect(result.breakdown.net).toBe(0);
      expect(result.breakdown.drained).toBe(0);
    });

    it('keeps full-condition organism at 100 with no surplus when idle', () => {
      const result = computeVitality(input({ hardiness: 0.5, condition: 100 }));
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });
  });

  describe('net-negative decline', () => {
    it('subtracts damage from condition when stressors dominate and the bank is empty', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('temp', 2.0)],
          benefits: [benefit('food', 0.5)],
          hardiness: 0.5,
          condition: 80,
        })
      );
      // damageRate = 2 × (1 - 0.5) = 1.0; benefitRate = 0.5; net = -0.5
      expect(result.breakdown.damageRate).toBeCloseTo(1.0, 6);
      expect(result.breakdown.benefitRate).toBeCloseTo(0.5, 6);
      expect(result.breakdown.net).toBeCloseTo(-0.5, 6);
      expect(result.newCondition).toBeCloseTo(79.5, 6);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.drained).toBe(0);
    });

    it('clamps newCondition at 0 when damage would push it below zero', () => {
      const result = computeVitality(
        input({ stressors: [stressor('lethal', 50)], hardiness: 0, condition: 5 })
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
          hardiness: 0, // full 2.0 %/h damage
          condition: 100,
          surplus: 10,
        })
      );
      expect(result.breakdown.net).toBeCloseTo(-2.0, 6);
      expect(result.newCondition).toBe(100); // fully buffered
      expect(result.breakdown.drained).toBeCloseTo(2.0, 6);
      expect(result.surplus).toBeCloseTo(8.0, 6); // 10 − 2
    });

    it('drains only the damage amount, leaving the rest banked', () => {
      const result = computeVitality(
        input({ stressors: [stressor('a', 1.5)], hardiness: 0, condition: 70, surplus: 20 })
      );
      expect(result.newCondition).toBe(70); // condition protected
      expect(result.surplus).toBeCloseTo(18.5, 6);
      expect(result.breakdown.drained).toBeCloseTo(1.5, 6);
    });

    it('splits the hit when the bank is smaller than the damage', () => {
      // bank 1, damage 3 → bank absorbs 1, condition eats the other 2.
      const result = computeVitality(
        input({ stressors: [stressor('a', 3)], hardiness: 0, condition: 80, surplus: 1 })
      );
      expect(result.breakdown.drained).toBe(1);
      expect(result.surplus).toBe(0);
      expect(result.newCondition).toBeCloseTo(78, 6); // 80 − (3 − 1)
    });

    it('decline resumes exactly when the bank empties', () => {
      // Two ticks of 1 %/h damage against a bank of 1, condition 100.
      // Tick 1: bank covers it, condition stays 100, bank → 0.
      // Tick 2: bank empty, condition falls the full 1 %/h.
      const tick1 = computeVitality(
        input({ stressors: [stressor('a', 1)], hardiness: 0, condition: 100, surplus: 1 })
      );
      expect(tick1.newCondition).toBe(100);
      expect(tick1.surplus).toBe(0);

      const tick2 = computeVitality(
        input({ stressors: [stressor('a', 1)], hardiness: 0, condition: 100, surplus: tick1.surplus })
      );
      expect(tick2.newCondition).toBeCloseTo(99, 6);
      expect(tick2.breakdown.drained).toBe(0);
    });

    it('a sub-100 organism with reserves has its condition protected too', () => {
      // The buffer is not gated on being at full condition — a stressed
      // organism with banked reserves still burns them before condition.
      const result = computeVitality(
        input({ stressors: [stressor('a', 2)], hardiness: 0, condition: 60, surplus: 5 })
      );
      expect(result.newCondition).toBe(60);
      expect(result.surplus).toBe(3);
      expect(result.breakdown.drained).toBe(2);
    });
  });

  describe('saturation cap', () => {
    it('accrues up to the cap then discards the overflow', () => {
      // Bank 49, net +5, cap 50 → banks 1, discards 4.
      const result = computeVitality(
        input({ benefits: [benefit('great', 5)], hardiness: 0.5, condition: 100, surplus: 49 })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(CAP);
    });

    it('a bank already at the cap absorbs no further accrual', () => {
      const result = computeVitality(
        input({ benefits: [benefit('great', 3)], hardiness: 0.5, condition: 100, surplus: CAP })
      );
      expect(result.surplus).toBe(CAP);
    });

    it('accrues the full net when it fits under the cap', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('mild', 0.5)],
          benefits: [benefit('great', 2.5)],
          hardiness: 0.6,
          condition: 100,
          surplus: 0,
        })
      );
      // damageRate = 0.5 × 0.4 = 0.2; benefitRate = 2.5; net = 2.3
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBeCloseTo(2.3, 6);
    });

    it('surplus is unchanged when at 100% but net is non-positive', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('a', 1)],
          benefits: [benefit('b', 0.5)],
          hardiness: 0.5,
          condition: 100,
          surplus: 4,
        })
      );
      // damageRate 0.5, benefitRate 0.5, net 0 → no drain, no accrual.
      expect(result.breakdown.net).toBeCloseTo(0, 6);
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(4);
    });
  });

  describe('self-heal clamp on oversized banks', () => {
    it('clamps an over-cap bank down to the cap on an idle tick', () => {
      const result = computeVitality(input({ hardiness: 0.5, condition: 90, surplus: 80 }));
      expect(result.surplus).toBe(CAP);
      expect(result.newCondition).toBe(90); // net 0, no heal
    });

    it('clamps an over-cap bank while healing sub-100', () => {
      const result = computeVitality(
        input({ benefits: [benefit('boost', 3)], hardiness: 0.5, condition: 90, surplus: 200 })
      );
      expect(result.newCondition).toBe(93);
      expect(result.surplus).toBe(CAP);
    });

    it('clamps an over-cap bank on a damage tick after draining', () => {
      // Over-cap bank clamps to 50 first, then drains the 2 %/h hit.
      const result = computeVitality(
        input({ stressors: [stressor('a', 2)], hardiness: 0, condition: 100, surplus: 90 })
      );
      expect(result.surplus).toBe(48); // 50 (clamped) − 2 (drained)
      expect(result.newCondition).toBe(100);
    });
  });

  describe('net-positive recovery (sub-100)', () => {
    it('adds net to condition when below 100, bank idle', () => {
      const result = computeVitality(
        input({
          stressors: [stressor('temp', 0.5)],
          benefits: [benefit('food', 1.5), benefit('oxygen', 0.5)],
          hardiness: 0.4,
          condition: 60,
          surplus: 7,
        })
      );
      // damageRate = 0.5 × 0.6 = 0.3; benefitRate = 2.0; net = 1.7
      expect(result.breakdown.net).toBeCloseTo(1.7, 6);
      expect(result.newCondition).toBeCloseTo(61.7, 6);
      // Bank retained (not accrued into while healing), just clamped.
      expect(result.surplus).toBe(7);
    });

    it('clamps to 100 when recovery would overshoot; overshoot is not banked', () => {
      const result = computeVitality(
        input({ benefits: [benefit('all', 5)], hardiness: 0.5, condition: 99, surplus: 0 })
      );
      expect(result.newCondition).toBe(100);
      // Overshoot spent on the final fraction, not carried into the bank.
      expect(result.surplus).toBe(0);
    });

    it('does not accrue surplus while sub-100 even with strong benefits', () => {
      const result = computeVitality(
        input({ benefits: [benefit('boost', 3)], hardiness: 0.5, condition: 90, surplus: 2 })
      );
      expect(result.newCondition).toBe(93);
      expect(result.surplus).toBe(2); // retained, not grown
    });
  });

  describe('accrual gating (accrueSurplus)', () => {
    it('discards positive overflow at full condition when accrual is gated off', () => {
      const result = computeVitality(
        input({
          benefits: [benefit('great', 3)],
          hardiness: 0.5,
          condition: 100,
          surplus: 10,
          accrueSurplus: false,
        })
      );
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(10); // overflow discarded, bank held
    });

    it('still drains the bank to buffer damage when accrual is gated off', () => {
      // Gating is on accrual only — the reserve still protects condition.
      const result = computeVitality(
        input({
          stressors: [stressor('a', 2)],
          hardiness: 0,
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

  describe('burning-reserves signal', () => {
    it('exposes drained > 0 at condition 100 with net < 0', () => {
      const result = computeVitality(
        input({ stressors: [stressor('a', 1.5)], hardiness: 0, condition: 100, surplus: 10 })
      );
      const burningReserves = result.newCondition >= 100 && result.breakdown.net < 0;
      expect(burningReserves).toBe(true);
      expect(result.breakdown.drained).toBeGreaterThan(0);
    });

    it('drained is zero on a healing tick', () => {
      const result = computeVitality(
        input({ benefits: [benefit('food', 2)], hardiness: 0.5, condition: 80, surplus: 5 })
      );
      expect(result.breakdown.drained).toBe(0);
    });
  });

  describe('hardiness scaling', () => {
    it('halves stressor impact at hardiness 0.5', () => {
      const result = computeVitality(
        input({ stressors: [stressor('temp', 4)], hardiness: 0.5, condition: 50 })
      );
      expect(result.breakdown.damageRate).toBe(2);
      expect(result.newCondition).toBe(48);
    });

    it('hardiness 1.0 nullifies all stressor damage', () => {
      const result = computeVitality(
        input({ stressors: [stressor('temp', 100)], hardiness: 1.0, condition: 50 })
      );
      expect(result.breakdown.damageRate).toBe(0);
      expect(result.newCondition).toBe(50);
    });

    it('hardiness 0 leaves stressors unscaled', () => {
      const result = computeVitality(
        input({ stressors: [stressor('temp', 4)], hardiness: 0, condition: 50 })
      );
      expect(result.breakdown.damageRate).toBe(4);
      expect(result.newCondition).toBe(46);
    });

    it('benefits do not scale with hardiness', () => {
      const r1 = computeVitality(input({ benefits: [benefit('food', 2)], hardiness: 0.1, condition: 80 }));
      const r2 = computeVitality(input({ benefits: [benefit('food', 2)], hardiness: 0.9, condition: 80 }));
      expect(r1.breakdown.benefitRate).toBe(2);
      expect(r2.breakdown.benefitRate).toBe(2);
      expect(r1.newCondition).toBe(82);
      expect(r2.newCondition).toBe(82);
    });

    it('clamps hardiness above 1 to 1', () => {
      const result = computeVitality(
        input({ stressors: [stressor('temp', 4)], hardiness: 1.5, condition: 50 })
      );
      expect(result.breakdown.damageRate).toBe(0);
    });

    it('clamps hardiness below 0 to 0', () => {
      const result = computeVitality(
        input({ stressors: [stressor('temp', 4)], hardiness: -0.5, condition: 50 })
      );
      expect(result.breakdown.damageRate).toBe(4);
    });
  });

  describe('breakdown shape', () => {
    it('preserves all factors in the breakdown for UI rendering', () => {
      const stressors = [stressor('a', 1), stressor('b', 2)];
      const benefits = [benefit('c', 3), benefit('d', 0.5)];
      const result = computeVitality(input({ stressors, benefits, hardiness: 0.5, condition: 80 }));
      expect(result.breakdown.stressors).toHaveLength(2);
      expect(result.breakdown.benefits).toHaveLength(2);
      expect(result.breakdown.stressors[0].amount).toBe(0.5);
      expect(result.breakdown.stressors[1].amount).toBe(1);
      expect(result.breakdown.benefits[0].amount).toBe(3);
      expect(result.breakdown.benefits[1].amount).toBe(0.5);
      expect(result.breakdown.stressors[0].key).toBe('a');
    });

    it('keeps zero-amount factors faithfully (caller decides filtering)', () => {
      const result = computeVitality(
        input({ stressors: [stressor('quiet', 0)], hardiness: 0.5, condition: 100 })
      );
      expect(result.breakdown.stressors).toHaveLength(1);
      expect(result.breakdown.stressors[0].amount).toBe(0);
    });
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
    // damage 3, bank 1 → drains 1, 2 overflows to the stock.
    expect(bankSurplus(1, -3, CAP, true)).toEqual({ surplus: 0, drained: 1, overflowDamage: 2 });
    // damage 2, bank 10 → fully covered.
    expect(bankSurplus(10, -2, CAP, true)).toEqual({ surplus: 8, drained: 2, overflowDamage: 0 });
  });

  it('drains regardless of the accrual gate', () => {
    expect(bankSurplus(10, -2, CAP, false)).toEqual({ surplus: 8, drained: 2, overflowDamage: 0 });
  });

  it('clamps an over-cap bank down to the cap on entry', () => {
    expect(bankSurplus(80, 0, CAP, true).surplus).toBe(CAP);
    // Clamp happens before draining: 80 → 50, then −2.
    expect(bankSurplus(80, -2, CAP, true)).toEqual({ surplus: 48, drained: 2, overflowDamage: 0 });
  });

  it('clamps a negative bank up to zero', () => {
    expect(bankSurplus(-5, 0, CAP, true).surplus).toBe(0);
  });

  it('is a no-op on the bank when net is zero', () => {
    expect(bankSurplus(12, 0, CAP, true)).toEqual({ surplus: 12, drained: 0, overflowDamage: 0 });
  });
});
