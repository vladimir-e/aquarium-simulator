import { describe, it, expect } from 'vitest';
import {
  computeFishVitality,
  createSimulation,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { readLedger, type Ledger } from './ledger.js';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 24 * 120,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function tank(fish: Fish[], ppm = 0): SimulationState {
  const state = { ...createSimulation({ tankCapacity: 200 }), fish };
  return ppm === 0
    ? state
    : { ...state, resources: { ...state.resources, ammonia: ppm * state.resources.water } };
}

function fishLedger(state: SimulationState, id = 'fish_a_1'): Ledger {
  return readLedger(state, DEFAULT_CONFIG, { kind: 'fish', id })!;
}

describe('readLedger', () => {
  it('quotes every factor at the rate the reader’s day is measured in', () => {
    const state = tank([makeFish({ id: 'fish_a_1', satiation: 5 })], 20);
    const ledger = fishLedger(state);
    const { breakdown } = computeFishVitality(
      state.fish[0],
      state.resources,
      state.plants,
      state.resources.water,
      state.tank.capacity,
      DEFAULT_CONFIG.livestock
    );

    for (const factor of [...breakdown.stressors, ...breakdown.upkeep]) {
      if (factor.amount <= 0) continue;
      const line = ledger.hurting.find((entry) => entry.key === factor.key)!;
      expect(line.perDay).toBeCloseTo(factor.amount * 24, 8);
    }
    expect(ledger.net).toBeCloseTo(breakdown.net * 24, 8);
  });

  it('lists nothing the tick did not charge', () => {
    const ledger = fishLedger(tank([makeFish({ id: 'fish_a_1' })]));

    expect([...ledger.helping, ...ledger.hurting].every((factor) => factor.perDay > 0)).toBe(true);
  });

  it('balances: what helps less what hurts is the number it prints', () => {
    for (const state of [
      tank([makeFish({ id: 'fish_a_1' })]),
      tank([makeFish({ id: 'fish_a_1', satiation: 5 })], 20),
    ]) {
      const ledger = fishLedger(state);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 6);
    }
  });

  it('sorts each column worst-first, so the reason is the top line', () => {
    const ledger = fishLedger(tank([makeFish({ id: 'fish_a_1', satiation: 5 })], 20));
    const rates = ledger.hurting.map((factor) => factor.perDay);

    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it('says what the bank is doing, and switches when it starts paying out', () => {
    const banked = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 5 })]));
    const paying = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 5 })], 20));

    expect(banked.bank!.note).toBe('banked against a bad day');
    expect(banked.bank!.at).toBeCloseTo(5 / DEFAULT_CONFIG.livestock.surplusCap, 8);
    expect(paying.bank!.note).toBe('paying out to hold condition');
  });

  it('has nothing to open for a fish the tank no longer holds', () => {
    const state = tank([makeFish({ id: 'fish_a_1' })]);

    expect(readLedger(state, DEFAULT_CONFIG, { kind: 'fish', id: 'fish_a_9' })).toBeNull();
    expect(readLedger(state, DEFAULT_CONFIG, { kind: 'plant', id: 'plant_a_1' })).toBeNull();
  });

  it('always has the algae to open — a population needs no id', () => {
    const algae = readLedger(tank([]), DEFAULT_CONFIG, { kind: 'algae' })!;

    expect(algae.species).toBe('algae');
    expect(algae.bank).toBeNull();
    expect(algae.verb).toBe('scrubAlgae');
  });
});
