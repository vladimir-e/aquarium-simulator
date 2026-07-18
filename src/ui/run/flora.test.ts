import { describe, it, expect } from 'vitest';
import { createSimulation, type Plant, type Resources } from '../../simulation/index.js';
import {
  algaeStatus,
  algaeWord,
  allNutrientsDepleted,
  conditionStatus,
  conditionWord,
  dosePresets,
  hardscapeSummary,
  nutrientReadings,
  nutrientState,
  scapeSummary,
  trimTargets,
} from './flora';

describe('condition + algae words', () => {
  it('maps plant condition to status and word', () => {
    expect(conditionStatus(20)).toBe('alert');
    expect(conditionStatus(45)).toBe('warn');
    expect(conditionStatus(90)).toBe('ok');
    expect(conditionWord(5)).toBe('dying');
    expect(conditionWord(50)).toBe('fair');
    expect(conditionWord(95)).toBe('thriving');
  });

  it('maps algae mass to status and word (low is good)', () => {
    expect(algaeStatus(10)).toBe('ok');
    expect(algaeStatus(45)).toBe('warn');
    expect(algaeStatus(90)).toBe('alert');
    expect(algaeWord(1)).toBe('suppressed');
    expect(algaeWord(70)).toBe('spreading');
    expect(algaeWord(95)).toBe('booming');
  });
});

describe('nutrientState', () => {
  it('bands a reading against its optimal range', () => {
    expect(nutrientState(0, 5, 20)).toBe('depleted');
    expect(nutrientState(3, 5, 20)).toBe('low');
    expect(nutrientState(15, 5, 20)).toBe('ok');
    expect(nutrientState(30, 5, 20)).toBe('high');
    expect(nutrientState(60, 5, 20)).toBe('veryHigh');
  });
});

describe('nutrientReadings / allNutrientsDepleted', () => {
  const base = createSimulation({ tankCapacity: 40 });

  it('reads four nutrients and flags all-depleted', () => {
    const empty: Resources = { ...base.resources, nitrate: 0, phosphate: 0, potassium: 0, iron: 0 };
    const readings = nutrientReadings(empty, empty.water);
    expect(readings.map((r) => r.label)).toEqual(['NO₃', 'PO₄', 'K', 'Fe']);
    expect(allNutrientsDepleted(readings)).toBe(true);
  });

  it('is not all-depleted when a nutrient is present', () => {
    const dosed: Resources = { ...base.resources, nitrate: 500, phosphate: 0, potassium: 0, iron: 0 };
    expect(allNutrientsDepleted(nutrientReadings(dosed, dosed.water))).toBe(false);
  });
});

describe('scape summary', () => {
  const items = [
    { id: '1', type: 'neutral_rock' as const },
    { id: '2', type: 'driftwood' as const },
    { id: '3', type: 'driftwood' as const },
  ];

  it('collapses hardscape by type with counts', () => {
    expect(hardscapeSummary(items)).toBe('rock + driftwood ×2');
  });

  it('prefixes the substrate, and omits hardscape when empty', () => {
    expect(scapeSummary('aqua_soil', items)).toBe('Aqua Soil + rock + driftwood ×2');
    expect(scapeSummary('aqua_soil', [])).toBe('Aqua Soil');
  });
});

describe('trim + dose derivation', () => {
  const base = createSimulation({ tankCapacity: 40 });
  const plant = (id: string, size: number): Plant => ({ id, species: 'java_fern', size, condition: 80, surplus: 0 });

  it('counts plants above each trim target and disables empty ones', () => {
    const state = { ...base, plants: [plant('a', 100), plant('b', 100)] };
    const targets = trimTargets(state);
    expect(targets.map((t) => t.count)).toEqual([2, 2, 0]);
    expect(targets.find((t) => t.target === 100)?.disabled).toBe(true);
  });

  it('previews dose nitrate scaling with volume', () => {
    const presets = dosePresets(40);
    expect(presets.map((p) => p.ml)).toEqual([1, 2, 4]);
    expect(presets[1].nitratePpm).toBeCloseTo(presets[0].nitratePpm * 2, 5);
  });
});
