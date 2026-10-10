import { describe, it, expect } from 'vitest';
import {
  buildAlgaeBenefits,
  buildAlgaeStressors,
  computeAlgaeVitality,
  thrivingPlantDensity,
  type AlgaeVitalityContext,
} from './algae-vitality.js';
import { healingPrice } from './flora.js';
import { getPlantPower } from './plant-power.js';
import { monodFactor } from '../core/kinetics.js';
import { ALGAE, ALGAE_KINDS } from '../algae/traits.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation, type Plant } from '../state.js';
import { plantRecord } from '../tests/plant.js';
import { bloomParams } from '../flora/params.js';
import { stocked, type FloraFluxes } from './flora-budget.js';

const { plants: plantsConfig, algae: algaeConfig } = DEFAULT_CONFIG;
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
      plants: [],
      plantsConfig,
      algaeConfig,
      ...overrides,
    };
  }

  const amount = (factors: { key: string; amount: number }[], key: string): number =>
    factors.find((f) => f.key === key)!.amount;
  const sum = (factors: { amount: number }[]): number => factors.reduce((total, f) => total + f.amount, 0);

  const sword = (condition: number): Plant => plantRecord({ id: `s${condition}`, species: 'amazon_sword', size: 100, condition });

  describe('allelopathy', () => {
    it('harms the bloom in proportion to thriving plant per litre of standing water, hardened, from no plants up', () => {
      const harm = (plants: Plant[], water = LITRES): number => {
        const ctx = context({ plants });
        return amount(buildAlgaeStressors({ ...ctx, resources: { ...ctx.resources, water } }), 'allelopathy');
      };

      expect(harm([])).toBe(0);
      expect(harm([sword(100)])).toBeCloseTo(
        algaeConfig.allelopathySeverity * (getPlantPower([sword(100)]) / LITRES) * (1 - traits.hardiness),
        12
      );
      expect(harm([sword(100), sword(100)])).toBeCloseTo(2 * harm([sword(100)]), 12);
      expect(harm([sword(100)], 2 * LITRES)).toBeCloseTo(harm([sword(100)]) / 2, 12);
    });

    it('comes from thriving plants only: a dying one harms nothing, a half-well one half', () => {
      expect(thrivingPlantDensity([sword(0)], LITRES)).toBe(0);
      expect(thrivingPlantDensity([sword(50)], LITRES)).toBeCloseTo(thrivingPlantDensity([sword(100)], LITRES) / 2, 12);
    });
  });

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
