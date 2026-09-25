import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processAlgae, spendAlgaeSurplus } from './index.js';
import { algaeVitalityDefaults } from '../config/algae-vitality.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';

function baseState(): SimulationState {
  return createSimulation({ tankCapacity: 100 });
}

describe('spendAlgaeSurplus', () => {
  it('drains surplus and increases mass when both are positive', () => {
    const algae = { mass: 0, surplus: 1 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next.surplus).toBeLessThan(1);
    expect(next.mass).toBeGreaterThan(0);
  });

  it('caps drain per tick at algaeGrowthPerTickCap', () => {
    const algae = { mass: 0, surplus: 1000 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    const drained = 1000 - next.surplus;
    expect(drained).toBeCloseTo(algaeVitalityDefaults.algaeGrowthPerTickCap, 8);
  });

  it('asymptotic factor → no growth when mass is at saturation', () => {
    const algae = { mass: 100, surplus: 10 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    // Drain still happens (factor on efficiency, not withdrawal),
    // but mass stays at 100.
    expect(next.mass).toBe(100);
    expect(next.surplus).toBeLessThan(10);
  });

  it('clamps mass at 100', () => {
    // Force a single-tick large gain via config knobs.
    const config = { ...algaeVitalityDefaults, massPerSurplus: 100, algaeGrowthPerTickCap: 100 };
    const algae = { mass: 90, surplus: 100 };
    const next = spendAlgaeSurplus(algae, config);
    expect(next.mass).toBe(100);
  });

  it('no-op when surplus is zero', () => {
    const algae = { mass: 50, surplus: 0 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next).toEqual(algae);
  });
});

describe('processAlgae', () => {

  it('negative net shrinks mass directly (24/7, lights off)', () => {
    // Heavy plants → suppression dominates. Lights off; the new
    // pipeline shrinks mass by the negative net regardless of
    // photoperiod.
    let state = baseState();
    state = produce(state, (draft) => {
      draft.algae = { mass: 80, surplus: 0 };
      draft.resources.light = 0;
      // Plants thriving — full power, well above suppressionThreshold.
      draft.plants = [
        { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
        { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
        { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
      ];
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeLessThan(80);
    // No surplus banking at night, and no positive net to bank anyway.
    expect(out.algae.surplus).toBe(0);
  });

  it('photoperiod gates surplus banking — positive net at night yields no growth', () => {
    // Pure-light scenario but with light = 0. Vitality would compute
    // positive net (low_plant_power + nutrient_deficiency benefits),
    // but the orchestrator's photoperiod gate discards the bank.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, surplus: 0 };
      draft.resources.light = 0;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.surplus).toBe(0);
    expect(out.algae.mass).toBe(0);
  });

  it('lights on + positive net → surplus banks unconditionally and converts to mass', () => {
    // Pure-light tank scenario: no plants, no nutrients, just photons.
    // Excess light + low plant power + nutrient deficiency benefits
    // stack with no stressors. Surplus banking should fire whether
    // the bloom started fresh (mass = 0) or established (mass > 0) —
    // there is no condition gate any more.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, surplus: 0 };
      draft.resources.light = 100; // substrate PAR, well above the excess threshold
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThan(0);
    expect(out.algae.surplus).toBeGreaterThanOrEqual(0);
  });

  it('mass cannot go negative when net is large and negative', () => {
    // Pathological scenario: massive negative net with low mass.
    // Direct mass + net step clamps at 0.
    let state = baseState();
    state = produce(state, (draft) => {
      draft.algae = { mass: 0.001, surplus: 0 };
      draft.resources.light = 0;
      draft.plants = [
        { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
        { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
        { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
      ];
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBe(0);
  });
});

describe('processAlgae — surplus buffer and cap', () => {
  // Algae inherits the same reserve-buffer semantics as fish/plants:
  // suppression drains the surplus bank before mass shrinks, accrual
  // saturates at `surplusCap`, and an over-cap bank self-heals.

  const heavyPlants = (): Plant[] => [
    { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
    { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
    { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
  ];

  it('drains the reserve before shrinking mass under suppression', () => {
    // Same heavy-plant suppression that shrinks an unbuffered bloom, but
    // with a stocked reserve: mass is protected while the bank absorbs
    // the hit, and the bank ticks down instead.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 80, surplus: 50 };
      draft.resources.light = 0;
      draft.plants = heavyPlants();
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBe(80); // fully buffered
    expect(out.algae.surplus).toBeLessThan(50);
  });

  it('shrinks mass only by the shortfall once the reserve cannot cover it', () => {
    // Tiny reserve vs the same suppression: the bank absorbs its sliver,
    // and the rest of the damage still reaches mass.
    const withReserve = produce(baseState(), (draft) => {
      draft.algae = { mass: 80, surplus: 0.1 };
      draft.resources.light = 0;
      draft.plants = heavyPlants();
    });
    const noReserve = produce(baseState(), (draft) => {
      draft.algae = { mass: 80, surplus: 0 };
      draft.resources.light = 0;
      draft.plants = heavyPlants();
    });
    const buffered = processAlgae(withReserve, DEFAULT_CONFIG).state.algae;
    const unbuffered = processAlgae(noReserve, DEFAULT_CONFIG).state.algae;
    expect(buffered.surplus).toBe(0);
    // The 0.1 reserve softens the hit by exactly 0.1 of mass.
    expect(buffered.mass).toBeCloseTo(unbuffered.mass + 0.1, 6);
  });

  it('never lets the surplus bank exceed the cap across a pure-light run', () => {
    let state = produce(baseState(), (draft) => {
      draft.algae = { mass: 10, surplus: 0 };
      draft.resources.light = 100; // strong excess light → positive net
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    for (let i = 0; i < 200; i++) {
      state = processAlgae(state, DEFAULT_CONFIG).state;
      expect(state.algae.surplus).toBeLessThanOrEqual(algaeVitalityDefaults.surplusCap);
    }
  });

  it('self-heals an over-cap bank from an old save', () => {
    // Lights off (no accrual, no spend), no plants: positive net can't
    // accrue, but the over-cap bank still clamps down to the cap.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 30, surplus: 80 };
      draft.resources.light = 0;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.surplus).toBe(algaeVitalityDefaults.surplusCap);
    expect(out.algae.mass).toBe(30);
  });
});
