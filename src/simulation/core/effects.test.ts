import { describe, it, expect, beforeEach } from 'vitest';
import { produce } from 'immer';
import { applyEffects, type Effect } from './effects.js';
import { createSimulation, type SimulationState } from '../state.js';
import { getDkh, getGhMass, getKhMass } from '../resources/helpers.js';
import { ofFood, organicsCloseTo } from '../tests/organics.js';

describe('applyEffects', () => {
  let initialState: SimulationState;

  beforeEach(() => {
    initialState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
    });
  });

  it('returns same state when no effects provided', () => {
    const newState = applyEffects(initialState, []);

    expect(newState).toBe(initialState);
  });

  it('applies single temperature effect', () => {
    const effects: Effect[] = [
      { tier: 'immediate', resource: 'temperature', delta: 2, source: 'heater' },
    ];

    const newState = applyEffects(initialState, effects);

    expect(newState.resources.temperature).toBe(27);
  });

  it('applies several effects in one batch', () => {
    const effects: Effect[] = [
      { tier: 'immediate', resource: 'temperature', delta: 2, source: 'heater' },
      { tier: 'passive', resource: 'temperature', delta: -0.5, source: 'drift' },
      { tier: 'passive', resource: 'water', delta: -1, source: 'evaporation' },
    ];

    const newState = applyEffects(initialState, effects);

    expect(newState.resources.temperature).toBe(26.5);
    expect(newState.resources.water).toBe(99);
  });

  it('does not mutate original state', () => {
    const effects: Effect[] = [
      { tier: 'immediate', resource: 'temperature', delta: 5, source: 'heater' },
    ];

    const newState = applyEffects(initialState, effects);

    expect(initialState.resources.temperature).toBe(25);
    expect(newState.resources.temperature).toBe(30);
    expect(newState).not.toBe(initialState);
  });

  describe('clamping', () => {
    it('clamps temperature to maximum of 50°C', () => {
      const effects: Effect[] = [
        { tier: 'immediate', resource: 'temperature', delta: 100, source: 'heater' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.temperature).toBe(50);
    });

    it('clamps temperature to minimum of 0°C', () => {
      const effects: Effect[] = [
        { tier: 'passive', resource: 'temperature', delta: -100, source: 'chiller' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.temperature).toBe(0);
    });

    it('clamps water level to maximum of tank capacity', () => {
      const effects: Effect[] = [
        { tier: 'immediate', resource: 'water', delta: 50, source: 'ato' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.water).toBe(100);
    });

    it('clamps water level to minimum of 0', () => {
      const effects: Effect[] = [
        { tier: 'passive', resource: 'water', delta: -200, source: 'evaporation' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.water).toBe(0);
    });
  });

  describe('netting', () => {
    it('applies a batch that nets inside the bounds exactly, wherever one effect alone would cross a bound', () => {
      const tank = produce(initialState, (draft) => {
        draft.resources.oxygen = 15;
        draft.resources.nitrate = 0;
        draft.resources.water = 95;
        draft.resources.waste = ofFood(2);
      });
      const effects: Effect[] = [
        { tier: 'passive', resource: 'oxygen', delta: 10, source: 'air' },
        { tier: 'passive', resource: 'oxygen', delta: -8, source: 'rot' },
        { tier: 'active', resource: 'nitrate', delta: -5, source: 'uptake' },
        { tier: 'active', resource: 'nitrate', delta: 8, source: 'excretion' },
        { tier: 'immediate', resource: 'water', delta: 10, source: 'top-off' },
        { tier: 'immediate', resource: 'water', delta: -8, source: 'evaporation' },
        { tier: 'passive', resource: 'waste', delta: ofFood(-5), source: 'rot' },
        { tier: 'active', resource: 'waste', delta: ofFood(4), source: 'shedding' },
      ];

      for (const batch of [effects, [...effects].reverse()]) {
        const after = applyEffects(tank, batch);
        expect(after.resources.oxygen).toBe(17);
        expect(after.resources.nitrate).toBe(3);
        expect(after.resources.water).toBe(97);
        expect(after.resources.waste).toEqual(organicsCloseTo(ofFood(1)));
      }
    });
  });

  describe('nutrient resources', () => {
    it('clamps nutrients to minimum of 0', () => {
      const effects: Effect[] = [
        { tier: 'passive', resource: 'phosphate', delta: -100, source: 'consumption' },
        { tier: 'passive', resource: 'potassium', delta: -100, source: 'consumption' },
        { tier: 'passive', resource: 'iron', delta: -100, source: 'consumption' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.phosphate).toBe(0);
      expect(newState.resources.potassium).toBe(0);
      expect(newState.resources.iron).toBe(0);
    });

    it('applies multiple nutrient effects together', () => {
      const effects: Effect[] = [
        { tier: 'active', resource: 'nitrate', delta: 50, source: 'dose' },
        { tier: 'active', resource: 'phosphate', delta: 5, source: 'dose' },
        { tier: 'active', resource: 'potassium', delta: 40, source: 'dose' },
        { tier: 'active', resource: 'iron', delta: 1, source: 'dose' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.nitrate).toBe(50);
      expect(newState.resources.phosphate).toBe(5);
      expect(newState.resources.potassium).toBe(40);
      expect(newState.resources.iron).toBe(1);
    });
  });

  it('holds any mass a full tank can carry, however large and hard', () => {
    const tank = createSimulation({ tankCapacity: 10000, tapKh: 0, tapGh: 0 });
    const kh = getKhMass(30, 10000);
    const gh = getGhMass(30, 10000);

    const newState = applyEffects(tank, [
      { tier: 'immediate', resource: 'kh', delta: kh, source: 'test' },
      { tier: 'immediate', resource: 'gh', delta: gh, source: 'test' },
    ]);

    expect(newState.resources.kh).toBe(kh);
    expect(newState.resources.gh).toBe(gh);
    expect(getDkh(newState.resources.kh, newState.resources.water)).toBeCloseTo(30, 10);
  });
});
