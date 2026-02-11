import { describe, it, expect } from 'vitest';
import {
  phDriftSystem,
  calculateHardscapeTargetPH,
  calculateCO2PHEffect,
} from './ph-drift.js';
import { createSimulation, type SimulationState, type HardscapeItem } from '../state.js';
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

  it('returns neutral pH with only plastic decoration', () => {
    const items: HardscapeItem[] = [{ id: '1', type: 'plastic_decoration' }];
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

    // Each additional item should increase pH less than the previous
    const firstIncrease = oneCalcite - phDefaults.neutralPh;
    const secondIncrease = twoCalcite - oneCalcite;
    const thirdIncrease = threeCalcite - twoCalcite;

    expect(twoCalcite).toBeGreaterThan(oneCalcite);
    expect(threeCalcite).toBeGreaterThan(twoCalcite);
    expect(secondIncrease).toBeLessThan(firstIncrease);
    expect(thirdIncrease).toBeLessThan(secondIncrease);
  });

  it('multiple driftwood pieces have cumulative effect with diminishing returns', () => {
    const oneDriftwood = calculateHardscapeTargetPH([{ id: '1', type: 'driftwood' }]);
    const twoDriftwood = calculateHardscapeTargetPH([
      { id: '1', type: 'driftwood' },
      { id: '2', type: 'driftwood' },
    ]);

    expect(twoDriftwood).toBeLessThan(oneDriftwood);
    expect(twoDriftwood).toBeGreaterThan(phDefaults.driftwoodTargetPh);
  });

  it('calcite and driftwood can cancel each other out', () => {
    const items: HardscapeItem[] = [
      { id: '1', type: 'calcite_rock' },
      { id: '2', type: 'driftwood' },
    ];
    const target = calculateHardscapeTargetPH(items);
    // With equal pieces, they partially cancel
    // The target should be close to neutral
    expect(target).toBeCloseTo(phDefaults.neutralPh, 0);
  });
});

describe('calculateCO2PHEffect', () => {
  it('returns 0 at atmospheric CO2 level', () => {
    const effect = calculateCO2PHEffect(phDefaults.co2NeutralLevel);
    // Note: JavaScript may produce -0, which is equal to 0 but not Object.is equal
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

  it('scales linearly with CO2 excess', () => {
    const effect10 = calculateCO2PHEffect(phDefaults.co2NeutralLevel + 10);
    const effect20 = calculateCO2PHEffect(phDefaults.co2NeutralLevel + 20);
    expect(effect20).toBeCloseTo(effect10 * 2, 5);
  });

  it('high CO2 (30 mg/L) significantly lowers pH target', () => {
    const effect = calculateCO2PHEffect(30);
    // (30 - 4) * -0.05 = -1.3
    expect(effect).toBeCloseTo(-1.3, 2);
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

  it('has correct id and tier', () => {
    expect(phDriftSystem.id).toBe('ph-drift');
    expect(phDriftSystem.tier).toBe('passive');
  });

  it('creates pH effect when pH differs from target', () => {
    const state = createTestState({
      ph: 6.0,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [], // Target is neutral (7.0)
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeGreaterThan(0); // Moving toward 7.0
    expect(phEffect!.source).toBe('ph-drift');
    expect(phEffect!.tier).toBe('passive');
  });

  it('creates negative effect when pH is above target', () => {
    const state = createTestState({
      ph: 8.0,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [], // Target is neutral (7.0)
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    const phEffect = effects.find((e) => e.resource === 'ph');
    expect(phEffect).toBeDefined();
    expect(phEffect!.delta).toBeLessThan(0); // Moving toward 7.0
  });

  it('creates no/negligible effect when pH equals target', () => {
    const state = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const effects = phDriftSystem.update(state, DEFAULT_CONFIG);

    // Either no effects or very small effect
    if (effects.length > 0) {
      const phEffect = effects.find((e) => e.resource === 'ph');
      if (phEffect) {
        expect(Math.abs(phEffect.delta)).toBeLessThan(0.001);
      }
    }
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
    expect(phEffect!.delta).toBeGreaterThan(0); // pH drifting up
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
    expect(phEffect!.delta).toBeLessThan(0); // pH drifting down
  });

  it('high CO2 lowers effective pH target', () => {
    const normalCO2State = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [],
    });
    const highCO2State = createTestState({
      ph: phDefaults.neutralPh,
      co2: 20, // High CO2
      hardscapeItems: [],
    });

    const normalEffects = phDriftSystem.update(normalCO2State, DEFAULT_CONFIG);
    const highCO2Effects = phDriftSystem.update(highCO2State, DEFAULT_CONFIG);

    // Normal should have no/negligible effect (at neutral target)
    const normalPhEffect = normalEffects.find((e) => e.resource === 'ph');
    if (normalPhEffect) {
      expect(Math.abs(normalPhEffect.delta)).toBeLessThan(0.001);
    }

    // High CO2 should push pH down
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

    // Expected: basePgDriftRate * (7.0 - 6.0) = 0.05 * 1.0 = 0.05
    expect(phEffect!.delta).toBeCloseTo(phDefaults.basePgDriftRate * (phDefaults.neutralPh - 6.0), 4);
  });

  it('neutral rock and plastic decoration do not affect pH', () => {
    const neutralState = createTestState({
      ph: phDefaults.neutralPh,
      co2: phDefaults.co2NeutralLevel,
      hardscapeItems: [
        { id: '1', type: 'neutral_rock' },
        { id: '2', type: 'plastic_decoration' },
      ],
    });
    const effects = phDriftSystem.update(neutralState, DEFAULT_CONFIG);

    // Should have no/negligible effect
    if (effects.length > 0) {
      const phEffect = effects.find((e) => e.resource === 'ph');
      if (phEffect) {
        expect(Math.abs(phEffect.delta)).toBeLessThan(0.001);
      }
    }
  });
});
