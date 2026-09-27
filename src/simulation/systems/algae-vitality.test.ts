import { describe, it, expect } from 'vitest';
import {
  buildAlgaeBenefits,
  buildAlgaeStressors,
  computeAlgaeVitality,
  thrivingPlantDensity,
  type AlgaeVitalityContext,
} from './algae-vitality.js';
import { dailyLightEdge, floraHealingRate, saturationIrradiance } from './flora.js';
import { getPlantPower } from './plant-power.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import { monodFactor } from '../core/kinetics.js';
import { ALGAE } from '../algae/traits.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation, type Plant } from '../state.js';
import { plantRecord } from '../tests/plant.js';

const { plants: plantsConfig, algae: algaeConfig } = DEFAULT_CONFIG;
const LITRES = 100;

function context(overrides: Partial<AlgaeVitalityContext> = {}): AlgaeVitalityContext {
  const resources = { ...createSimulation({ tankCapacity: LITRES }).resources, temperature: 25, co2: 4 };
  const edge = dailyLightEdge(ALGAE);
  return {
    bloom: { mass: 20, condition: 100, surplus: 0 },
    traits: ALGAE,
    resources,
    plants: [],
    litres: LITRES,
    plantsConfig,
    algaeConfig,
    nutrientSufficiency: 1,
    light: { par: 200, dailyLight: 4 * edge, needShare: 4 },
    ...overrides,
  };
}

const amount = (factors: { key: string; amount: number }[], key: string): number =>
  factors.find((f) => f.key === key)!.amount;
const sum = (factors: { amount: number }[]): number => factors.reduce((total, f) => total + f.amount, 0);

const sword = (condition: number): Plant =>
  plantRecord({ id: `s${condition}`, species: 'amazon_sword', size: 100, condition, surplus: 0 });

describe('allelopathy', () => {
  it('harms the bloom in proportion to thriving plant per litre, hardened, from no plants up', () => {
    const harm = (plants: Plant[], litres = LITRES): number =>
      amount(buildAlgaeStressors(context({ plants, litres })), 'allelopathy');

    expect(harm([])).toBe(0);
    expect(harm([sword(100)])).toBeCloseTo(
      algaeConfig.allelopathySeverity * (getPlantPower([sword(100)]) / LITRES) * (1 - ALGAE.hardiness),
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
  it('runs on the plants’ light curve and the Liebig sufficiency, and is nothing in the dark', () => {
    const earned = (par: number, nutrientSufficiency = 1): number =>
      sum(buildAlgaeBenefits(context({ light: { par, dailyLight: 1, needShare: 1 }, nutrientSufficiency })));
    const ik = saturationIrradiance(ALGAE, plantsConfig);

    expect(earned(0)).toBe(0);
    expect(earned(ik) / earned(1e6)).toBeCloseTo(Math.tanh(1), 6);
    expect(earned(200, 0.5)).toBeCloseTo(earned(200) / 2, 12);
    expect(earned(200, 0)).toBe(0);
  });

  it('earns CO₂ on its own half-saturation', () => {
    const co2Income = (co2: number): number =>
      amount(buildAlgaeBenefits(context({ resources: { ...context().resources, co2 } })), 'co2');

    expect(co2Income(25) / co2Income(4)).toBeCloseTo(
      monodFactor(25, ALGAE.co2HalfSaturation) / monodFactor(4, ALGAE.co2HalfSaturation),
      12
    );
  });
});

describe('light starvation', () => {
  const starvation = (needShare: number): number =>
    amount(
      buildAlgaeStressors(
        context({ light: { par: 0, dailyLight: needShare * dailyLightEdge(ALGAE), needShare } })
      ),
      'lightStarvation'
    );

  it('charges nothing while the day’s light meets its edge, and grows as it falls short', () => {
    expect(starvation(1)).toBe(0);
    expect(starvation(2)).toBe(0);
    expect(starvation(0.25)).toBeCloseTo(0.75 * starvation(0), 12);
  });

  it('costs what respiration does, at the bloom’s pace', () => {
    expect(starvation(0)).toBeCloseTo(
      plantsConfig.lightStarvationSeverity *
        ALGAE.pace *
        getRespirationTemperatureFactor(25, plantsConfig) *
        (1 - ALGAE.hardiness),
      12
    );
  });
});

describe('computeAlgaeVitality', () => {
  it('heals on the plants’ law, integrated over the hour', () => {
    const hurt = computeAlgaeVitality(
      context({ bloom: { mass: 20, condition: 10, surplus: 10 }, light: { par: 0, dailyLight: 4 * dailyLightEdge(ALGAE), needShare: 4 } })
    );
    expect(hurt.breakdown.healed).toBeCloseTo(10 * -Math.expm1(-floraHealingRate(ALGAE, plantsConfig)), 12);
  });

  it('banks income only at full condition, and heals a bloom below it from the bank', () => {
    const full = computeAlgaeVitality(context());
    expect(full.newCondition).toBe(100);
    expect(full.surplus).toBeGreaterThan(0);

    const hurt = computeAlgaeVitality(context({ bloom: { mass: 20, condition: 60, surplus: 10 } }));
    expect(hurt.breakdown.healed).toBeGreaterThan(0);
    expect(hurt.surplus).toBeLessThan(10);
  });
});
