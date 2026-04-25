import { describe, it, expect } from 'vitest';
import { computeVitality, type VitalityFactor } from './vitality.js';

function stressor(key: string, amount: number, label = key): VitalityFactor {
  return { key, label, amount, kind: 'damage' };
}

function benefit(key: string, amount: number, label = key): VitalityFactor {
  return { key, label, amount, kind: 'benefit' };
}

describe('computeVitality', () => {
  describe('empty input', () => {
    it('returns condition unchanged with zero surplus when nothing is happening', () => {
      const result = computeVitality({
        stressors: [],
        benefits: [],
        hardiness: 0.5,
        condition: 80,
      });
      expect(result.newCondition).toBe(80);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.damageRate).toBe(0);
      expect(result.breakdown.benefitRate).toBe(0);
      expect(result.breakdown.net).toBe(0);
    });

    it('keeps full-condition organism at 100 with no surplus when idle', () => {
      const result = computeVitality({
        stressors: [],
        benefits: [],
        hardiness: 0.5,
        condition: 100,
      });
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });
  });

  describe('net-negative decline', () => {
    it('subtracts damage from condition when stressors dominate', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 2.0)],
        benefits: [benefit('food', 0.5)],
        hardiness: 0.5,
        condition: 80,
      });
      // damageRate = 2 × (1 - 0.5) = 1.0
      // benefitRate = 0.5
      // net = -0.5
      expect(result.breakdown.damageRate).toBeCloseTo(1.0, 6);
      expect(result.breakdown.benefitRate).toBeCloseTo(0.5, 6);
      expect(result.breakdown.net).toBeCloseTo(-0.5, 6);
      expect(result.newCondition).toBeCloseTo(79.5, 6);
      expect(result.surplus).toBe(0);
    });

    it('clamps newCondition at 0 when damage would push it below zero', () => {
      const result = computeVitality({
        stressors: [stressor('lethal', 50)],
        benefits: [],
        hardiness: 0,
        condition: 5,
      });
      expect(result.newCondition).toBe(0);
      expect(result.surplus).toBe(0);
      expect(result.breakdown.damageRate).toBe(50);
    });
  });

  describe('net-positive recovery (sub-100)', () => {
    it('adds net to condition when below 100, no surplus', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 0.5)],
        benefits: [benefit('food', 1.5), benefit('oxygen', 0.5)],
        hardiness: 0.4,
        condition: 60,
      });
      // damageRate = 0.5 × (1 - 0.4) = 0.3
      // benefitRate = 2.0
      // net = 1.7
      expect(result.breakdown.damageRate).toBeCloseTo(0.3, 6);
      expect(result.breakdown.benefitRate).toBeCloseTo(2.0, 6);
      expect(result.breakdown.net).toBeCloseTo(1.7, 6);
      expect(result.newCondition).toBeCloseTo(61.7, 6);
      expect(result.surplus).toBe(0);
    });

    it('clamps to 100 when recovery would overshoot, surplus stays zero', () => {
      // Sub-100 organism with overshoot: caps at 100, no surplus that
      // tick. The leftover energy is "spent" healing the final fraction
      // — by design we don't carry it over to surplus, so the trajectory
      // stays clean (one tick at full → next tick produces surplus).
      const result = computeVitality({
        stressors: [],
        benefits: [benefit('all', 5)],
        hardiness: 0.5,
        condition: 99,
      });
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });
  });

  describe('surplus capture at full condition', () => {
    it('produces surplus equal to net when at 100% condition', () => {
      const result = computeVitality({
        stressors: [stressor('mild', 0.5)],
        benefits: [benefit('great', 2.5)],
        hardiness: 0.6,
        condition: 100,
      });
      // damageRate = 0.5 × 0.4 = 0.2
      // benefitRate = 2.5
      // net = 2.3
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBeCloseTo(2.3, 6);
    });

    it('surplus is zero when at 100% but net is non-positive', () => {
      // Edge case: organism at 100% with net == 0 must produce zero
      // surplus, not a stale prior value, and condition stays put.
      const result = computeVitality({
        stressors: [stressor('a', 1)],
        benefits: [benefit('b', 0.5)],
        hardiness: 0.5,
        condition: 100,
      });
      // damageRate = 1 × 0.5 = 0.5; benefitRate = 0.5; net = 0
      expect(result.breakdown.net).toBeCloseTo(0, 6);
      expect(result.newCondition).toBe(100);
      expect(result.surplus).toBe(0);
    });

    it('does not produce surplus while sub-100 even with strong benefits', () => {
      // The locked design: a stressed organism heals first, never grows
      // while the deficit is unpaid. Even with a huge net rate, surplus
      // is zero until condition hits 100.
      const result = computeVitality({
        stressors: [],
        benefits: [benefit('boost', 3)],
        hardiness: 0.5,
        condition: 90,
      });
      expect(result.newCondition).toBe(93);
      expect(result.surplus).toBe(0);
    });
  });

  describe('hardiness scaling', () => {
    it('halves stressor impact at hardiness 0.5', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 4)],
        benefits: [],
        hardiness: 0.5,
        condition: 50,
      });
      // damageRate = 4 × 0.5 = 2
      expect(result.breakdown.damageRate).toBe(2);
      expect(result.newCondition).toBe(48);
    });

    it('hardiness 1.0 nullifies all stressor damage', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 100)],
        benefits: [],
        hardiness: 1.0,
        condition: 50,
      });
      expect(result.breakdown.damageRate).toBe(0);
      expect(result.newCondition).toBe(50);
    });

    it('hardiness 0 leaves stressors unscaled', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 4)],
        benefits: [],
        hardiness: 0,
        condition: 50,
      });
      expect(result.breakdown.damageRate).toBe(4);
      expect(result.newCondition).toBe(46);
    });

    it('benefits do not scale with hardiness', () => {
      // Hardy organisms aren't more energised — they're harder to break.
      const r1 = computeVitality({
        stressors: [],
        benefits: [benefit('food', 2)],
        hardiness: 0.1,
        condition: 80,
      });
      const r2 = computeVitality({
        stressors: [],
        benefits: [benefit('food', 2)],
        hardiness: 0.9,
        condition: 80,
      });
      expect(r1.breakdown.benefitRate).toBe(2);
      expect(r2.breakdown.benefitRate).toBe(2);
      expect(r1.newCondition).toBe(82);
      expect(r2.newCondition).toBe(82);
    });

    it('clamps hardiness above 1 to 1', () => {
      // Defensive: caller-provided hardiness shouldn't break the math
      // even if a config bug or extreme offset slips through.
      const result = computeVitality({
        stressors: [stressor('temp', 4)],
        benefits: [],
        hardiness: 1.5,
        condition: 50,
      });
      expect(result.breakdown.damageRate).toBe(0);
    });

    it('clamps hardiness below 0 to 0', () => {
      const result = computeVitality({
        stressors: [stressor('temp', 4)],
        benefits: [],
        hardiness: -0.5,
        condition: 50,
      });
      expect(result.breakdown.damageRate).toBe(4);
    });
  });

  describe('breakdown shape', () => {
    it('preserves all factors in the breakdown for UI rendering', () => {
      const stressors = [stressor('a', 1), stressor('b', 2)];
      const benefits = [benefit('c', 3), benefit('d', 0.5)];
      const result = computeVitality({
        stressors,
        benefits,
        hardiness: 0.5,
        condition: 80,
      });
      expect(result.breakdown.stressors).toHaveLength(2);
      expect(result.breakdown.benefits).toHaveLength(2);
      // Stressor amounts are post-hardiness; benefits unchanged.
      expect(result.breakdown.stressors[0].amount).toBe(0.5);
      expect(result.breakdown.stressors[1].amount).toBe(1);
      expect(result.breakdown.benefits[0].amount).toBe(3);
      expect(result.breakdown.benefits[1].amount).toBe(0.5);
      expect(result.breakdown.stressors[0].key).toBe('a');
    });

    it('omits zero-amount factors faithfully (caller decides filtering)', () => {
      // The module doesn't filter — UI does. A 0-severity factor still
      // appears in the breakdown so the caller can show "this is being
      // checked but not contributing" if they want to.
      const result = computeVitality({
        stressors: [stressor('quiet', 0)],
        benefits: [],
        hardiness: 0.5,
        condition: 100,
      });
      expect(result.breakdown.stressors).toHaveLength(1);
      expect(result.breakdown.stressors[0].amount).toBe(0);
    });
  });
});
