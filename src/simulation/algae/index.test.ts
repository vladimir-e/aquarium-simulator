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
    expect(next.mass).toBe(100);
    expect(next.surplus).toBeLessThan(10);
  });

  it('clamps mass at 100', () => {
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
    let state = baseState();
    state = produce(state, (draft) => {
      draft.algae = { mass: 80, surplus: 0 };
      draft.resources.light = 0;
      draft.plants = [
        { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
        { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
        { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
      ];
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeLessThan(80);
    expect(out.algae.surplus).toBe(0);
  });

  it('photoperiod gates surplus banking — positive net at night yields no growth', () => {
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
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, surplus: 0 };
      draft.resources.light = 100;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThan(0);
    expect(out.algae.surplus).toBeGreaterThanOrEqual(0);
  });

  it('mass cannot go negative when net is large and negative', () => {
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
  const heavyPlants = (): Plant[] => [
    { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
    { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
    { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
  ];

  it('drains the reserve before shrinking mass under suppression', () => {
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 80, surplus: 50 };
      draft.resources.light = 0;
      draft.plants = heavyPlants();
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBe(80);
    expect(out.algae.surplus).toBeLessThan(50);
  });

  it('shrinks mass only by the shortfall once the reserve cannot cover it', () => {
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
    expect(buffered.mass).toBeCloseTo(unbuffered.mass + 0.1, 6);
  });

  it('never lets the surplus bank exceed the cap across a pure-light run', () => {
    let state = produce(baseState(), (draft) => {
      draft.algae = { mass: 10, surplus: 0 };
      draft.resources.light = 100;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    for (let i = 0; i < 200; i++) {
      state = processAlgae(state, DEFAULT_CONFIG).state;
      expect(state.algae.surplus).toBeLessThanOrEqual(algaeVitalityDefaults.surplusCap);
    }
  });

  it('self-heals an over-cap bank from an old save', () => {
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
