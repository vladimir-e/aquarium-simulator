import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  ALGAE_KINDS,
  applyAction,
  createSimulation,
  getPresetById,
  plantLightTaken,
  tick,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';
import { LEDGER_DECIMALS, readLedger, type Ledger, type LedgerTarget } from './ledger.js';
import { FED, STARVING } from '../test/gut';
import { printsAsZero, projectedTrend } from './status.js';
import { TICKS_PER_DAY } from '../utils/clock.js';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 24 * 120,
    gut: FED,
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

function ledgerOf(
  state: SimulationState,
  target: LedgerTarget,
  config: TunableConfig = DEFAULT_CONFIG
): Ledger | null {
  return readLedger(state, config, readHourAhead(state, config), target);
}

function fishLedger(state: SimulationState, id = 'fish_a_1', config = DEFAULT_CONFIG): Ledger {
  return ledgerOf(state, { kind: 'fish', id }, config)!;
}

describe('readLedger', () => {
  it('quotes every factor that prints at the rate the reader’s day is measured in, and no other', () => {
    const state = tank([makeFish({ id: 'fish_a_1', gut: STARVING })], 20);
    const ledger = fishLedger(state);
    const { breakdown } = readHourAhead(state, DEFAULT_CONFIG).fish[0].vitality;
    const shows = (perDay: number): boolean => Number(perDay.toFixed(LEDGER_DECIMALS)) > 0;

    for (const factor of breakdown.stressors) {
      const line = ledger.hurting.find((entry) => entry.key === factor.key);
      if (!shows(factor.amount * 24)) {
        expect(line).toBeUndefined();
        continue;
      }
      expect(line!.perDay).toBeCloseTo(factor.amount * 24, 8);
    }
    expect([...ledger.helping, ...ledger.hurting].every((line) => shows(line.perDay))).toBe(true);
    expect(ledger.net).toBeCloseTo(breakdown.net * 24, 8);
  });

  it('balances: what helps less what hurts is the number it prints', () => {
    for (const state of [
      tank([makeFish({ id: 'fish_a_1' })]),
      tank([makeFish({ id: 'fish_a_1', gut: STARVING })], 20),
    ]) {
      const ledger = fishLedger(state);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 6);
    }
  });

  it('sorts each column worst-first, so the reason is the top line', () => {
    const ledger = fishLedger(tank([makeFish({ id: 'fish_a_1', gut: STARVING })], 20));
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

  it('reads a bank too small to print as empty, whatever the hour draws on it', () => {
    const ledger = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 0.03 })], 20));

    expect(ledger.bank!.text).toBe('0.0');
    expect(ledger.bank!.note).toBe('empty');
  });

  it('reads a bank held above a lowered cap as full, not as healing', () => {
    const lowered: TunableConfig = {
      ...DEFAULT_CONFIG,
      livestock: { ...DEFAULT_CONFIG.livestock, surplusCap: 25 },
    };
    const ledger = fishLedger(tank([makeFish({ id: 'fish_a_1', surplus: 50 })]), 'fish_a_1', lowered);

    expect(ledger.bank!.note).toBe('full');
  });

  it('never reads the bank of an organism the next tick takes as a purchase', () => {
    const cap = DEFAULT_CONFIG.livestock.surplusCap;
    const dying = tank(
      [
        makeFish({ id: 'fish_a_1', sex: 'female', health: 0.5, surplus: cap / 5 }),
        makeFish({ id: 'fish_a_2', sex: 'male', health: 0.5, surplus: cap / 5 }),
      ],
      500
    );
    const next = tick(dying, DEFAULT_CONFIG);

    expect(next.fish).toHaveLength(0);
    for (const id of ['fish_a_1', 'fish_a_2']) {
      const { bank } = fishLedger(dying, id);
      expect(bank!.text).not.toBe('0.0');
      expect(bank!.note).not.toMatch(/^buying/);
    }
  });

  it('reads the bank a spawn empties as buying a brood, the hour before it spawns', () => {
    const cap = DEFAULT_CONFIG.livestock.surplusCap;
    const pair = tank([
      makeFish({ id: 'fish_a_1', sex: 'female', surplus: cap }),
      makeFish({ id: 'fish_a_2', sex: 'male' }),
    ]);
    const next = tick(pair, DEFAULT_CONFIG);

    expect(next.clutches.length).toBeGreaterThan(pair.clutches.length);
    expect(next.fish.find((fish) => fish.id === 'fish_a_1')!.surplus).toBe(0);
    expect(fishLedger(pair).bank!.note).toBe('buying a brood');
  });

  describe('for a plant', () => {
    const half = DEFAULT_CONFIG.plants.surplusCap / 2;
    const planted = (hour: number, surplus = half): SimulationState => {
      const dosed = applyAction(createSimulation({ tankCapacity: 200 }, undefined, 1), { type: 'dose', amountMl: 20 }, DEFAULT_CONFIG);
      const state = applyAction(dosed.state, {
        type: 'addPlant',
        species: 'java_fern',
      }).state;
      return { ...state, tick: hour, plants: state.plants.map((plant) => ({ ...plant, surplus })) };
    };
    const plantLedger = (state: SimulationState): Ledger =>
      ledgerOf(state, { kind: 'plant', id: state.plants[0].id })!;

    it('banks by day and buys growth out of the bank by night', () => {
      expect(plantLedger(planted(10, 0)).bank!.note).toBe('banking');
      expect(plantLedger(planted(0)).bank!.note).toBe('buying growth');
    });

    it('names the bank by which way the next tick moves it, and by what it buys', () => {
      const cap = DEFAULT_CONFIG.plants.surplusCap;
      const budding = planted(10, cap);
      const grown = { ...budding, plants: budding.plants.map((plant) => ({ ...plant, size: 100 })) };

      const notes = [planted(0, 2), planted(10, 2), planted(0), planted(10), budding, grown].map((state) => {
        const next = tick(state, DEFAULT_CONFIG).plants;
        const moved = next[0].surplus - state.plants[0].surplus;
        const note = plantLedger(state).bank!.note;

        expect(note).toBe(
          printsAsZero(moved * TICKS_PER_DAY, 1)
            ? 'held against a bad day'
            : moved > 0
              ? 'banking'
              : next.length > state.plants.length
                ? 'buying an offshoot'
                : 'buying growth'
        );
        return note;
      });
      expect(notes).toContain('buying an offshoot');
    });

    it('never reads the bank of a plant the next tick takes as buying growth', () => {
      const dark = planted(0, half);
      const dying = {
        ...dark,
        equipment: { ...dark.equipment, light: { ...dark.equipment.light, enabled: false } },
        resources: { ...dark.resources, lightByHour: dark.resources.lightByHour.map(() => 0) },
        plants: dark.plants.map((plant) => ({ ...plant, condition: 0.001, surplus: 1 })),
      };

      expect(tick(dying, DEFAULT_CONFIG).plants).toHaveLength(0);
      expect(plantLedger(dying).bank!.note).not.toMatch(/^buying/);
    });

    it('tones its light warn exactly while the light-high stressor charges it, whatever its need', () => {
      const burns = [20, 200, 800].map((par) => {
        const state = produce(planted(10), (draft) => {
          draft.equipment.light.par = par;
        });
        const { light } = plantLedger(state);
        const { vitality } = readHourAhead(state, DEFAULT_CONFIG).plants[0];
        const burning = vitality.breakdown.stressors.find((s) => s.key === 'light')!.amount > 0;

        expect(light!.status === 'warn').toBe(burning || Number(light!.text) < 100);
        return burning;
      });
      expect(burns).toContain(true);
      expect(burns).toContain(false);
    });

    it('carries the lamp to its leaf, naming each taker that moved the light', () => {
      const green = produce(planted(10), (draft) => {
        draft.algae.greenWater.mass = 40;
        draft.algae.film.mass = 40;
      });
      const { lightPath } = plantLedger(green);
      const { light } = readHourAhead(green, DEFAULT_CONFIG).plants[0];
      const lamp = green.equipment.light.par;

      expect(lightPath!.steps.map((step) => step.key)).toEqual(expect.arrayContaining(['water', 'greenWater', 'film']));
      expect(lightPath!.steps.every((step) => step.key === 'canopy' || step.change < 0)).toBe(true);
      expect(lightPath!.heading).toBe(`${Math.round(light.par)} of the lamp's ${lamp} PAR reach its leaf`);
    });

    it('trends by the condition the next tick leaves it at', () => {
      const dawn = planted(7);
      const state = { ...dawn, plants: dawn.plants.map((plant) => ({ ...plant, condition: 70 })) };
      const change = (tick(state, DEFAULT_CONFIG).plants[0].condition - 70) * 24;

      expect(plantLedger(state).trend).toBe(`↗ ${change.toFixed(1)}/d`);
    });
  });

  it.each(ALGAE_KINDS)('reads %s as an organism: its condition trended as the next tick leaves it, its coverage by what the tick does to the mass', (kind) => {
    const preset = getPresetById('planted')!;
    let state = produce(createSimulation(preset.config, preset.seed), (draft) => {
      Object.assign(draft.algae[kind], { mass: 20, condition: 70, surplus: 0 });
    });
    for (let hour = 0; hour < 24; hour++) {
      const next = tick(state, DEFAULT_CONFIG);
      const ledger = ledgerOf(state, { kind: 'algae', bloom: kind })!;
      const { vitality } = readHourAhead(state, DEFAULT_CONFIG).algae[kind];

      expect(ledger.value).toBe(Math.floor(state.algae[kind].condition).toString());
      expect(ledger.trend).toBe(projectedTrend(next.algae[kind].condition - state.algae[kind].condition));
      expect(ledger.coverage!.note).toBe(projectedTrend(next.algae[kind].mass - state.algae[kind].mass));
      expect(ledger.net).toBeCloseTo(vitality.breakdown.net * 24, 10);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 10);
      state = next;
    }
  });

  it('reads the share of the plants’ light a bloom takes, and none with nothing planted', () => {
    const carpeted = applyAction(tank([]), { type: 'addPlant', species: 'monte_carlo' }).state;
    const green = produce(carpeted, (draft) => {
      draft.algae.greenWater.mass = 40;
    });
    const { lightTaken } = ledgerOf(green, { kind: 'algae', bloom: 'greenWater' })!;

    expect(Number(lightTaken!.text)).toBe(Math.round(plantLightTaken(green, DEFAULT_CONFIG.optics).greenWater * 100));
    expect(ledgerOf(tank([]), { kind: 'algae', bloom: 'greenWater' })!.lightTaken).toBeNull();
  });

  it('has nothing to open for a fish the tank no longer holds', () => {
    const state = tank([makeFish({ id: 'fish_a_1' })]);

    expect(ledgerOf(state, { kind: 'fish', id: 'fish_a_9' })).toBeNull();
    expect(ledgerOf(state, { kind: 'plant', id: 'plant_a_1' })).toBeNull();
  });

  it('always has every bloom to open — a population needs no id — each on the verb that takes it out', () => {
    const verbs = ALGAE_KINDS.map((kind) => ledgerOf(tank([]), { kind: 'algae', bloom: kind })!);

    expect(verbs.map((ledger) => ledger.species)).toEqual([...ALGAE_KINDS]);
    expect(ledgerOf(tank([]), { kind: 'algae', bloom: 'greenWater' })!.verb).toBe('waterChange');
    expect(ledgerOf(tank([]), { kind: 'algae', bloom: 'film' })!.verb).toBe('scrubAlgae');
  });

  it.each(ALGAE_KINDS)('reads the %s bank banking while lit and buying growth through the night', (kind) => {
    const preset = getPresetById('planted')!;
    let state = produce(createSimulation(preset.config, preset.seed), (draft) => {
      draft.plants = [];
      draft.resources.nitrate = 100 * draft.resources.water;
      Object.assign(draft.algae[kind], { mass: 20, condition: 100, surplus: 10 });
    });
    const notes = new Map<boolean, Set<string>>([
      [true, new Set()],
      [false, new Set()],
    ]);
    for (let hour = 0; hour < 24; hour++) {
      const next = tick(state, DEFAULT_CONFIG);
      const { bank } = ledgerOf(state, { kind: 'algae', bloom: kind })!;

      notes.get(next.resources.light > 0)!.add(bank!.note);
      expect(bank!.text).toBe(state.algae[kind].surplus.toFixed(1));
      state = next;
    }
    expect(notes.get(true)).toContain('banking');
    expect(notes.get(false)).toContain('buying growth');
  });
});
