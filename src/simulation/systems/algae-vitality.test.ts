import { describe, it, expect } from 'vitest';
import {
  buildAlgaeBenefits,
  buildAlgaeStressors,
  computeAlgaeVitality,
  type AlgaeVitalityContext,
} from './algae-vitality.js';
import { healingPrice } from './flora.js';
import { monodFactor } from '../core/kinetics.js';
import { ALGAE, ALGAE_KINDS } from '../algae/traits.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation } from '../state.js';
import { bloomParams } from '../flora/params.js';
import { stocked, type FloraFluxes } from './flora-budget.js';

const { plants: plantsConfig } = DEFAULT_CONFIG;
const LITRES = 100;

const PAID: FloraFluxes = {
  returned: 0,
  assimilated: 0,
  mobilised: 0,
  toStructure: 0,
  fromStructure: 0,
  burned: { maintenance: 1, growth: 0, starvation: 0, healing: 0 },
  owed: 1,
  shortfall: 0,
};

describe.each(ALGAE_KINDS)('%s', (kind) => {
  const traits = ALGAE[kind];
  const params = bloomParams(kind, plantsConfig);

  function context(overrides: Partial<AlgaeVitalityContext> = {}): AlgaeVitalityContext {
    const resources = { ...createSimulation({ tankCapacity: LITRES }).resources, temperature: 25, co2: 4 };
    return {
      bloom: { budget: stocked(2, params), condition: 100 },
      fluxes: PAID,
      traits,
      params,
      resources,
      plantsConfig,
      ...overrides,
    };
  }

  const amount = (factors: { key: string; amount: number }[], key: string): number =>
    factors.find((f) => f.key === key)!.amount;
  const sum = (factors: { amount: number }[]): number => factors.reduce((total, f) => total + f.amount, 0);

  describe('income', () => {
    it('runs on its reserve density, and is nothing on a burned reserve', () => {
      const earned = (reserve: number): number =>
        sum(buildAlgaeBenefits(context({ bloom: { budget: { ...stocked(2, params), reserve }, condition: 100 } })));
      const full = stocked(2, params).reserve;
      expect(earned(full / 2)).toBeCloseTo(earned(full) / 2, 12);
      expect(earned(0)).toBe(0);
    });

    it('earns CO₂ on its own half-saturation', () => {
      const co2Income = (co2: number): number =>
        amount(buildAlgaeBenefits(context({ resources: { ...context().resources, co2 } })), 'co2');

      expect(co2Income(25) / co2Income(4)).toBeCloseTo(
        monodFactor(25, traits.co2HalfSaturation) / monodFactor(4, traits.co2HalfSaturation),
        12
      );
    });
  });

  it('starves on the share of its upkeep the hour left unpaid, hardened', () => {
    const starved = amount(buildAlgaeStressors(context({ fluxes: { ...PAID, shortfall: 1 } })), 'starvation');
    expect(starved).toBeCloseTo(plantsConfig.starvationSeverity * (1 - traits.hardiness), 12);
    expect(amount(buildAlgaeStressors(context()), 'starvation')).toBe(0);
  });

  it('heals the points its reserve paid for, and banks nothing', () => {
    const budget = stocked(2, params);
    const price = healingPrice(budget, params, plantsConfig);
    const hurt = computeAlgaeVitality(
      context({ bloom: { budget, condition: 60 }, fluxes: { ...PAID, burned: { ...PAID.burned, healing: 2 * price } } })
    );
    expect(hurt.breakdown.healed).toBeCloseTo(2, 12);
    expect(computeAlgaeVitality(context()).newCondition).toBe(100);
  });
});
