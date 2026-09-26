import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createSimulation,
  tick,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';
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
    const { breakdown } = readHourAhead(state, DEFAULT_CONFIG).fish[0];

    for (const factor of breakdown.stressors) {
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

  it('says what the bank is doing: banking income, or healing out of it', () => {
    const banking = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 5 })]));
    const healing = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 5 })], 20));

    expect(banking.bank!.note).toBe('banking');
    expect(banking.bank!.at).toBeCloseTo(5 / DEFAULT_CONFIG.livestock.surplusCap, 8);
    expect(healing.bank!.note).toBe('healing from reserve');
  });

  it('says so when the bank can neither take income nor heal', () => {
    const cap = DEFAULT_CONFIG.livestock.surplusCap;
    const full = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: cap })]));
    const empty = fishLedger(tank([makeFish({ id: 'fish_a_1' })], 20));

    expect(full.bank!.note).toBe('full');
    expect(empty.bank!.note).toBe('empty');
  });

  describe('for a plant', () => {
    const half = DEFAULT_CONFIG.plants.surplusCap / 2;
    const planted = (hour: number, surplus = half): SimulationState => {
      const state = applyAction(createSimulation({ tankCapacity: 200 }), {
        type: 'addPlant',
        species: 'java_fern',
      }).state;
      return { ...state, tick: hour, plants: state.plants.map((plant) => ({ ...plant, surplus })) };
    };
    const plantLedger = (state: SimulationState): Ledger =>
      readLedger(state, DEFAULT_CONFIG, { kind: 'plant', id: state.plants[0].id })!;

    it('banks by day and buys growth out of the bank by night', () => {
      expect(plantLedger(planted(10, 0)).bank!.note).toBe('banking');
      expect(plantLedger(planted(0)).bank!.note).toBe('buying growth');
    });

    it('names the bank by which way the next tick moves it', () => {
      const cap = DEFAULT_CONFIG.plants.surplusCap;
      const budding = planted(10, cap);
      const grown = { ...budding, plants: budding.plants.map((plant) => ({ ...plant, size: 100 })) };

      for (const state of [planted(0, 2), planted(10, 2), planted(0), planted(10), grown]) {
        const moved = tick(state, DEFAULT_CONFIG).plants[0].surplus - state.plants[0].surplus;

        expect(plantLedger(state).bank!.note).toBe(moved > 0 ? 'banking' : 'buying growth');
      }
    });

    it('trends by the condition the next tick leaves it at', () => {
      const dawn = planted(7);
      const state = { ...dawn, plants: dawn.plants.map((plant) => ({ ...plant, condition: 70 })) };
      const change = (tick(state, DEFAULT_CONFIG).plants[0].condition - 70) * 24;

      expect(plantLedger(state).trend).toBe(`↗ ${change.toFixed(1)}/d`);
    });
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
