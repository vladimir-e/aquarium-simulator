import { describe, it, expect } from 'vitest';
import { pointsHealed, repairAsked, repairPrice } from './reserve.js';
import { stocked } from './flora-budget.js';
import { plantParams } from '../flora/params.js';
import { plantsDefaults } from '../config/plants.js';
import { hourlyDraw } from '../core/kinetics.js';

describe('repair', () => {
  const terms = plantsDefaults;
  const p = plantParams('amazon_sword', terms);
  const budget = stocked(2, p);

  it('prices a point at healingCost hours of the upkeep its structure owes', () => {
    expect(repairPrice(budget, p, terms)).toBeCloseTo(terms.healingCost * p.pM * 2, 15);
    expect(repairPrice(stocked(4, p), p, terms)).toBeCloseTo(2 * repairPrice(budget, p, terms), 15);
  });

  it('asks its deficit closing first order at healingRate × τ, and nothing at full condition', () => {
    expect(repairAsked(budget, p, 100, 1, terms)).toBe(0);
    expect(repairAsked(budget, p, 60, 2, terms)).toBeCloseTo(
      repairPrice(budget, p, terms) * hourlyDraw(2 * terms.healingRate) * 40,
      15
    );
  });

  it('heals a point for every price’s worth burned, and nothing on no structure', () => {
    expect(pointsHealed(3 * repairPrice(budget, p, terms), budget, p, terms)).toBeCloseTo(3, 12);
    expect(pointsHealed(1, stocked(0, p), p, terms)).toBe(0);
  });
});
