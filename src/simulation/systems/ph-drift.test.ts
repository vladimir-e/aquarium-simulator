import { describe, it, expect } from 'vitest';
import {
  phDriftSystem,
  calculateHardscapeTargetPH,
  calculateCO2PHEffect,
} from './ph-drift.js';
import { createSimulation, type SimulationState } from '../state.js';
import type { HardscapeItem } from '../equipment/hardscape.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { phDefaults } from '../config/ph.js';

describe('calculateHardscapeTargetPH', () => {
  it('returns neutral pH when no hardscape', () => {
    const target = calculateHardscapeTargetPH([]);
    expect(target).toBe(phDefaults.neutralPh);
  });

  it('returns neutral pH with only neutral rock', () => {
    const items: HardscapeItem[] = [{ id: '1', type: 'neutral_rock' }];
    const target = calculateHardscapeTargetPH(items);
    expect(target).toBe(phDefaults.neutralPh);
  });

  it('raises pH toward calcite target with calcite rock', () => {
    const items: HardscapeItem[] = [{ id: '1', type: 'calcite_rock' }];
    const target = calculateHardscapeTargetPH(items);
    expect(target).toBeGreaterThan(phDefaults.neutralPh);
    expect(target).toBeLessThan(phDefaults.calciteTargetPh);
  });

  it('lowers pH toward driftwood target with driftwood', () => {
    const items: HardscapeItem[] = [{ id: '1', type: 'driftwood' }];
    const target = calculateHardscapeTargetPH(items);
    expect(target).toBeLessThan(phDefaults.neutralPh);
    expect(target).toBeGreaterThan(phDefaults.driftwoodTargetPh);
  });

  it('multiple calcite rocks have cumulative effect with diminishing returns', () => {
    const oneCalcite = calculateHardscapeTargetPH([{ id: '1', type: 'calcite_rock' }]);
    const twoCalcite = calculateHardscapeTargetPH([
      { id: '1', type: 'calcite_rock' },
      { id: '2', type: 'calcite_rock' },
    ]);
    const threeCalcite = calculateHardscapeTargetPH([
      { id: '1', type: 'calcite_rock' },
      { id: '2', type: 'calcite_rock' },
      { id: '3', type: 'calcite_rock' },
    ]);

    const firstIncrease = oneCalcite - phDefaults.neutralPh;
    const secondIncrease = twoCalcite - oneCalcite;
    const thirdIncrease = threeCalcite - twoCalcite;

    expect(twoCalcite).toBeGreaterThan(oneCalcite);
    expect(threeCalcite).toBeGreaterThan(twoCalcite);
    expect(secondIncrease).toBeLessThan(firstIncrease);
    expect(thirdIncrease).toBeLessThan(secondIncrease);
  });
});

describe('calculateCO2PHEffect', () => {
  it('returns 0 at atmospheric CO2 level', () => {
    const effect = calculateCO2PHEffect(phDefaults.co2NeutralLevel);
    expect(effect).toBeCloseTo(0, 10);
  });

  it('returns negative value when CO2 is above atmospheric', () => {
    const effect = calculateCO2PHEffect(phDefaults.co2NeutralLevel + 10);
    expect(effect).toBeLessThan(0);
  });

  it('returns positive value when CO2 is below atmospheric', () => {
    const effect = calculateCO2PHEffect(phDefaults.co2NeutralLevel - 2);
    expect(effect).toBeGreaterThan(0);
  });

  it('scales logarithmically with CO2 (each doubling is a fixed step)', () => {
    const effect4x = calculateCO2PHEffect(phDefaults.co2NeutralLevel * 4);
    const effect2x = calculateCO2PHEffect(phDefaults.co2NeutralLevel * 2);
    const step = effect2x - 0;
    expect(effect4x).toBeCloseTo(2 * step, 5);
  });

  it('0 CO2 is a safe no-op (guard)', () => {
    expect(calculateCO2PHEffect(0)).toBe(0);
  });
});

describe('phDriftSystem', () => {
  function createTestState(overrides: Partial<{
    ph: number;
    co2: number;
    hardscapeItems: HardscapeItem[];
  }> = {}): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      if (overrides.ph !== undefined) {
        draft.resources.ph = overrides.ph;
      }
      if (overrides.co2 !== undefined) {
        draft.resources.co2 = overrides.co2;
      }
      if (overrides.hardscapeItems !== undefined) {
        draft.equipment.hardscape.items = overrides.hardscapeItems;
      }
    });
  }

  it('creates pH effect when pH differs from target', () => {
    const state = createTestState({
      ph: 6.0,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeGreaterThan(0);
    expect(phEffect!.source).toBe('ph-drift');
    expect(phEffect!.tier).toBe('passive');
  });

  it('creates negative effect when pH is above target', () => {
    const state = createTestState({
      ph: 8.0,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeLessThan(0);
  });

  it('creates no/negligible effect when pH equals target', () => {
    const state = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    expect(Math.abs(effects.find((e) => e.resource === 'ph')?.delta ?? 0)).toBeLessThan(0.001);
  });

  it('calcite rock raises pH target', () => {
    const state = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [{ id: '1', type: 'calcite_rock' }],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeGreaterThan(0);
  });

  it('driftwood lowers pH target', () => {
    const state = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [{ id: '1', type: 'driftwood' }],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeLessThan(0);
  });

  it('high CO2 lowers effective pH target', () => {
    const normalCO2State = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const highCO2State = createTestState({
      ph: phDefaults.neutralPh,
      co2: 20,
      hardscapeItems: [],
    });

    const normalEffects = phDriftSystem.update(normalCO2State, DEFAULT_CONFIG);
    const highCO2Effects = phDriftSystem.update(highCO2State, DEFAULT_CONFIG);

    expect(Math.abs(normalEffects.find((e) => e.resource === 'ph')?.delta ?? 0)).toBeLessThan(0.001);

    const highCO2Effect = highCO2Effects.find((e) => e.resource === 'ph');
    expect(highCO2Effect).toBeDefined();
    expect(highCO2Effect!.delta).toBeLessThan(0);
  });

  it('drift rate follows exponential decay pattern', () => {
    const state = createTestState({
      ph: 6.0,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();

    expect(phEffect!.delta).toBeCloseTo(phDefaults.basePgDriftRate * (phDefaults.neutralPh - 6.0), 4);
  });
});
