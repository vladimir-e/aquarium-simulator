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
import { bloomAt } from '../../simulation/tests/blooms.js';
import { bloomMass } from '../../simulation/algae/index.js';
import { offshootStructure } from '../../simulation/plants/create-plant.js';
import { LEDGER_DECIMALS, readLedger, type Ledger, type LedgerTarget } from './ledger.js';
import { FED, atReserve, starving } from '../test/gut';
import { projectedTrend } from './status.js';
import { fishRecord, holdingEggs } from '../../simulation/tests/fish.js';
import { spawnsAt } from '../../simulation/systems/brood.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return fishRecord({ age: 24 * 120, gut: FED, ...overrides });
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
    const state = tank([starving(makeFish({ id: 'fish_a_1', gut: 0 }))], 20);
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
      tank([starving(makeFish({ id: 'fish_a_1', gut: 0 }))], 20),
    ]) {
      const ledger = fishLedger(state);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 6);
    }
  });

  it('sorts each column worst-first, so the reason is the top line', () => {
    const ledger = fishLedger(tank([starving(makeFish({ id: 'fish_a_1', gut: 0 }))], 20));
    const rates = ledger.hurting.map((factor) => factor.perDay);

    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it('reads a fish’s reserve where a plant’s bank stands: its density, in percent', () => {
    const ledger = fishLedger(tank([atReserve(makeFish({ id: 'fish_a_1' }), 0.8)]));
    expect(ledger.bank).toMatchObject({ label: 'Reserve', text: '80', unit: '% full' });
    expect(ledger.bank!.at).toBeCloseTo(0.8, 12);
  });

  it('says what the reserve does over the hour: filling, drawing down, healing from reserve, or short of upkeep', () => {
    const lean = atReserve(makeFish({ id: 'fish_a_1' }), 0.9);
    expect(fishLedger(tank([lean])).bank!.note).toBe('filling');
    expect(fishLedger(tank([{ ...makeFish({ id: 'fish_a_1' }), gut: 0 }])).bank!.note).toBe('drawing down');
    expect(fishLedger(tank([makeFish({ id: 'fish_a_1', health: 80 })])).bank!.note).toBe('healing from reserve');
    expect(fishLedger(tank([starving(makeFish({ id: 'fish_a_1', gut: 0 }))])).bank!.note).toBe('short of upkeep');
  });

  it('reads a spawning female’s reserve as spawning the hour she lays', () => {
    const ripe = (fish: Fish): Fish => holdingEggs(fish, spawnsAt('neon_tetra') + 20);
    const pair = tank([
      ripe(makeFish({ id: 'fish_a_1', sex: 'female' })),
      ripe(makeFish({ id: 'fish_a_2', sex: 'male' })),
    ]);
    const next = tick(pair, DEFAULT_CONFIG);

    expect(next.clutches.length).toBeGreaterThan(pair.clutches.length);
    expect(fishLedger(pair).bank!.note).toBe('spawning');
  });

  describe('for a plant', () => {
    const planted = (hour: number, buffer = 0): SimulationState => {
      const dosed = applyAction(createSimulation({ tankCapacity: 200 }, undefined, 1), { type: 'dose', amountMl: 20 }, DEFAULT_CONFIG);
      const state = applyAction(dosed.state, {
        type: 'addPlant',
        species: 'java_fern',
      }).state;
      return {
        ...state,
        tick: hour,
        plants: state.plants.map((plant) => ({ ...plant, budget: { ...plant.budget, offshootBuffer: buffer } })),
      };
    };
    const plantLedger = (state: SimulationState): Ledger =>
      ledgerOf(state, { kind: 'plant', id: state.plants[0].id })!;
    it('reads its offshoot buffer as its share of the next offshoot, filling, or buying one', () => {
      const empty = planted(10);
      expect(plantLedger(empty).bank).toMatchObject({ label: 'Buffer', at: 0, note: 'filling' });
      const full = planted(10, 1.01 * offshootStructure('java_fern'));
      expect(tick(full, DEFAULT_CONFIG).plants).toHaveLength(2);
      expect(plantLedger(full).bank).toMatchObject({ at: 1, note: 'buying an offshoot' });
    });

    it('reads a buffer paying the upkeep its starving plant’s reserve cannot as short of upkeep', () => {
      const dark = planted(0);
      const starving = {
        ...dark,
        equipment: { ...dark.equipment, light: { ...dark.equipment.light, enabled: false } },
        resources: { ...dark.resources, lightByHour: dark.resources.lightByHour.map(() => 0) },
        plants: dark.plants.map((plant) => ({ ...plant, budget: { ...plant.budget, reserve: 0 } })),
      };
      expect(plantLedger(starving).bank!.note).toBe('short of upkeep');
    });

    it('names the buffer by what the next tick does to it', () => {
      const unit = offshootStructure('java_fern');
      const unfedInTheDark = (state: SimulationState): SimulationState => ({
        ...state,
        equipment: { ...state.equipment, light: { ...state.equipment.light, enabled: false } },
        resources: { ...state.resources, lightByHour: state.resources.lightByHour.map(() => 0) },
        plants: state.plants.map((plant) => ({ ...plant, budget: { ...plant.budget, reserve: 0 } })),
      });
      const states = [planted(10, unit / 2), planted(0, unit / 2), planted(10, 1.01 * unit), unfedInTheDark(planted(0, unit / 2))];
      const notes = states.map((state) => {
        const next = tick(state, DEFAULT_CONFIG);
        const moved = next.plants[0].budget.offshootBuffer - state.plants[0].budget.offshootBuffer;
        const note = plantLedger(state).bank!.note;
        expect(note).toBe(next.plants.length > state.plants.length ? 'buying an offshoot' : moved > 0 ? 'filling' : 'short of upkeep');
        return note;
      });
      expect(new Set(notes)).toEqual(new Set(['filling', 'buying an offshoot', 'short of upkeep']));
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
        draft.algae.greenWater = bloomAt(draft, 'greenWater', 40);
        draft.algae.film = bloomAt(draft, 'film', 40);
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
      draft.algae[kind] = bloomAt(draft, kind, 20, 70);
    });
    for (let hour = 0; hour < 24; hour++) {
      const next = tick(state, DEFAULT_CONFIG);
      const ledger = ledgerOf(state, { kind: 'algae', bloom: kind })!;
      const { vitality } = readHourAhead(state, DEFAULT_CONFIG).algae[kind];

      expect(ledger.value).toBe(Math.floor(state.algae[kind].condition).toString());
      expect(ledger.trend).toBe(projectedTrend(next.algae[kind].condition - state.algae[kind].condition));
      expect(ledger.coverage!.note).toBe(projectedTrend(bloomMass(next, kind) - bloomMass(state, kind)));
      expect(ledger.net).toBeCloseTo(vitality.breakdown.net * 24, 10);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 10);
      state = next;
    }
  });

  it('reads the share of the plants’ light a bloom takes, and none with nothing planted', () => {
    const carpeted = applyAction(tank([]), { type: 'addPlant', species: 'monte_carlo' }).state;
    const green = produce(carpeted, (draft) => {
      draft.algae.greenWater = bloomAt(draft, 'greenWater', 40);
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

  it.each(ALGAE_KINDS)('reads %s with no store row: a bloom buys no offshoots', (kind) => {
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.algae[kind] = bloomAt(draft, kind, 20);
    });
    expect(ledgerOf(state, { kind: 'algae', bloom: kind })!.bank).toBeNull();
  });

});
