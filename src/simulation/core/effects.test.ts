import { describe, it, expect, beforeEach } from 'vitest';
import { applyEffects, type Effect } from './effects.js';
import { createSimulation, type SimulationState } from '../state.js';

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

  it('applies single water level effect', () => {
    const effects: Effect[] = [
      { tier: 'passive', resource: 'water', delta: -5, source: 'evaporation' },
    ];

    const newState = applyEffects(initialState, effects);

    expect(newState.resources.water).toBe(95);
  });

  it('applies multiple effects in sequence', () => {
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

  describe('nutrient resources', () => {
    it('applies phosphate effect', () => {
      const effects: Effect[] = [
        { tier: 'active', resource: 'phosphate', delta: 10, source: 'dose' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.phosphate).toBe(10);
    });

    it('applies potassium effect', () => {
      const effects: Effect[] = [
        { tier: 'active', resource: 'potassium', delta: 20, source: 'dose' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.potassium).toBe(20);
    });

    it('applies iron effect', () => {
      const effects: Effect[] = [
        { tier: 'active', resource: 'iron', delta: 5, source: 'dose' },
      ];

      const newState = applyEffects(initialState, effects);

      expect(newState.resources.iron).toBe(5);
    });

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
});
