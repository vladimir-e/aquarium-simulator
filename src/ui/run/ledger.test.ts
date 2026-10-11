import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  ALGAE_KINDS,
  allelopathy,
  applyAction,
  bloomParams,
  createSimulation,
  droopFactor,
  droopLimits,
  fillAtDroop,
  getPresetById,
  plantLightTaken,
  plantParams,
  starvation,
  storeFill,
  tick,
  wellFed,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import { NUTRIENTS } from '../../simulation/config/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';
import { bloomAt } from '../../simulation/tests/blooms.js';
import { bloomMass } from '../../simulation/algae/index.js';
import { offshootStructure } from '../../simulation/plants/create-plant.js';
import { LEDGER_DECIMALS, readLedger, type BudgetRow, type Ledger, type LedgerTarget } from './ledger.js';
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

function line(ledger: Ledger, key: string): BudgetRow | undefined {
  return ledger.budget.find((row) => row.key === key);
}

const reserveOf = (ledger: Ledger): BudgetRow => line(ledger, 'reserve')!;

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

  it('reads a fish’s reserve as its density, in percent, and nothing of stores', () => {
    const ledger = fishLedger(tank([atReserve(makeFish({ id: 'fish_a_1' }), 0.8)]));
    expect(ledger.budget).toHaveLength(1);
    expect(reserveOf(ledger)).toMatchObject({ label: 'Reserve', text: '80', unit: '% full' });
    expect(reserveOf(ledger).at).toBeCloseTo(0.8, 12);
    expect(ledger.stores).toEqual([]);
  });

  it('says what the reserve does over the hour: filling, drawing down, healing from reserve, or short of upkeep', () => {
    const lean = atReserve(makeFish({ id: 'fish_a_1' }), 0.9);
    expect(reserveOf(fishLedger(tank([lean]))).note).toBe('filling');
    expect(reserveOf(fishLedger(tank([{ ...makeFish({ id: 'fish_a_1' }), gut: 0 }]))).note).toBe('drawing down');
    expect(reserveOf(fishLedger(tank([makeFish({ id: 'fish_a_1', health: 80 })]))).note).toBe('healing from reserve');
    expect(reserveOf(fishLedger(tank([starving(makeFish({ id: 'fish_a_1', gut: 0 }))]))).note).toBe('short of upkeep');
  });

  it('reads a spawning female’s reserve as spawning the hour she lays', () => {
    const ripe = (fish: Fish): Fish => holdingEggs(fish, spawnsAt('neon_tetra') + 20);
    const pair = tank([
      ripe(makeFish({ id: 'fish_a_1', sex: 'female' })),
      ripe(makeFish({ id: 'fish_a_2', sex: 'male' })),
    ]);
    const next = tick(pair, DEFAULT_CONFIG);

    expect(next.clutches.length).toBeGreaterThan(pair.clutches.length);
    expect(reserveOf(fishLedger(pair)).note).toBe('spawning');
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
    const plantlet = (state: SimulationState): BudgetRow => line(plantLedger(state), 'plantlet')!;
    const withBudget = (state: SimulationState, budget: Partial<SimulationState['plants'][number]['budget']>): SimulationState => ({
      ...state,
      plants: state.plants.map((plant) => ({ ...plant, budget: { ...plant.budget, ...budget } })),
    });
    const unfedInTheDark = (state: SimulationState): SimulationState => ({
      ...withBudget(state, { reserve: 0 }),
      equipment: { ...state.equipment, light: { ...state.equipment.light, enabled: false } },
      resources: { ...state.resources, lightByHour: state.resources.lightByHour.map(() => 0) },
    });
    const fern = plantParams('java_fern', DEFAULT_CONFIG.plants);

    it('reads its reserve as the fish’s is read, filling or drawing down by the hour’s fluxes', () => {
      for (const state of [planted(10), planted(0), withBudget(planted(10), { reserve: 0 })]) {
        const { fluxes } = readHourAhead(state, DEFAULT_CONFIG).plants[0];
        const reserve = reserveOf(plantLedger(state));
        const fills = fluxes.assimilated - fluxes.mobilised - fluxes.burned.healing >= 0;
        expect(reserve.at).toBeCloseTo(wellFed(state.plants[0].budget, fern), 12);
        expect(reserve.note).toBe(fills ? 'filling' : 'drawing down');
      }
      expect(reserveOf(plantLedger(planted(10))).note).toBe('filling');
      expect(reserveOf(plantLedger(planted(0))).note).toBe('drawing down');
    });

    it('reads a Starving line only while upkeep goes unpaid, as the share unpaid', () => {
      const dark = unfedInTheDark(planted(0));
      const { fluxes } = readHourAhead(dark, DEFAULT_CONFIG).plants[0];
      expect(line(plantLedger(dark), 'starving')).toMatchObject({
        text: String(Math.ceil(starvation({ fluxes }) * 100)),
        unit: '% of upkeep unpaid',
      });
      expect(line(plantLedger(planted(10)), 'starving')).toBeUndefined();
    });

    it('reads Healing as the points its reserve pays for a day, only while it repairs', () => {
      const hurt = { ...planted(10), plants: planted(10).plants.map((plant) => ({ ...plant, condition: 70 })) };
      const { vitality } = readHourAhead(hurt, DEFAULT_CONFIG).plants[0];
      expect(line(plantLedger(hurt), 'healing')).toMatchObject({
        text: `+${(vitality.breakdown.healed * 24).toFixed(LEDGER_DECIMALS)}`,
        note: 'paid from reserve',
      });
      expect(line(plantLedger(planted(10)), 'healing')).toBeUndefined();
    });

    it('reads its plantlet as the share built, and cuts loose this hour once the buffer holds one', () => {
      expect(plantlet(planted(10))).toMatchObject({ label: 'Plantlet', at: 0, unit: '% built' });
      const full = planted(10, 1.01 * offshootStructure('java_fern'));
      expect(tick(full, DEFAULT_CONFIG).plants).toHaveLength(2);
      expect(plantlet(full)).toMatchObject({ at: 1, note: 'cuts loose this hour' });
    });

    it('names the plantlet by what the next tick does to its buffer', () => {
      const unit = offshootStructure('java_fern');
      const states = [planted(10, unit / 2), planted(0, unit / 2), planted(10, 1.01 * unit), unfedInTheDark(planted(0, unit / 2))];
      const notes = states.map((state) => {
        const next = tick(state, DEFAULT_CONFIG);
        const moved = next.plants[0].budget.offshootBuffer - state.plants[0].budget.offshootBuffer;
        const { note } = plantlet(state);
        if (next.plants.length > state.plants.length) expect(note).toBe('cuts loose this hour');
        else if (moved > 0) expect(note).toMatch(/^cuts loose (in \d+ d|within a day)$/);
        else expect(note).toBe('paying upkeep');
        return note.replace(/ in \d+ d$/, '');
      });
      expect(new Set(notes)).toEqual(new Set(['cuts loose', 'cuts loose this hour', 'paying upkeep']));
    });

    it('waits on stores while an empty store lets the buffer fill no further, or a full one cannot pay a plantlet’s Q_min', () => {
      const unit = offshootStructure('java_fern');
      const ironless = (state: SimulationState): SimulationState => ({
        ...withBudget(state, { stores: { ...state.plants[0].budget.stores, iron: 0 } }),
        resources: { ...state.resources, iron: 0 },
      });
      const dry = ironless(planted(10, unit / 2));
      expect(tick(dry, DEFAULT_CONFIG).plants[0].budget.offshootBuffer).toBe(unit / 2);
      expect(plantlet(dry).note).toBe('waiting on stores');

      const held = ironless(planted(10, 1.01 * unit));
      expect(tick(held, DEFAULT_CONFIG).plants).toHaveLength(1);
      expect(plantlet(held).note).toBe('waiting on stores');
    });

    it('reads each store’s fill banded from the Droop edge, the least named with the growth it allows, and short under the edge', () => {
      const lean = withBudget(planted(10), {
        stores: { ...planted(10).plants[0].budget.stores, phosphate: 0.05 * fern.qMin.phosphate * planted(10).plants[0].budget.structure },
      });
      const { budget } = lean.plants[0];
      const fill = storeFill(budget, fern);
      const limits = droopLimits(budget, fern);
      const edge = fillAtDroop(fern, DEFAULT_CONFIG.plants.droopEdge);
      const { stores } = plantLedger(lean);

      expect(stores.map((row) => row.key)).toEqual([...NUTRIENTS]);
      for (const row of stores) {
        const n = row.key as (typeof NUTRIENTS)[number];
        expect(row.text).toBe(String(Math.floor(fill[n] * 100)));
        expect(row.band!.from).toBeCloseTo(edge[n], 12);
        expect(row.status).toBe(limits[n] < DEFAULT_CONFIG.plants.droopEdge ? 'alert' : 'neutral');
      }
      const named = stores.filter((row) => row.note !== '');
      expect(named.map((row) => row.key)).toEqual(['phosphate']);
      expect(named[0].note).toBe(`holds growth to ${Math.floor(droopFactor(budget, fern) * 100)} %`);
      expect(named[0].status).toBe('alert');
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

  it.each(ALGAE_KINDS)('reads %s’s reserve and stores, no plantlet, and the planting’s hold while anything is planted', (kind) => {
    const bare = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.algae[kind] = bloomAt(draft, kind, 20);
    });
    const planted = applyAction(bare, { type: 'addPlant', species: 'amazon_sword' }).state;
    const p = bloomParams(kind, DEFAULT_CONFIG.plants);

    const alone = ledgerOf(bare, { kind: 'algae', bloom: kind })!;
    expect(reserveOf(alone).at).toBeCloseTo(wellFed(bare.algae[kind].budget, p), 12);
    expect(alone.stores.map((row) => row.text)).toEqual(
      NUTRIENTS.map((n) => String(Math.floor(storeFill(bare.algae[kind].budget, p)[n] * 100)))
    );
    expect(line(alone, 'plantlet')).toBeUndefined();
    expect(line(alone, 'held')).toBeUndefined();

    const held = allelopathy(planted.plants, planted.resources.water, DEFAULT_CONFIG.algae).assimilation;
    expect(held).toBeLessThan(1);
    expect(line(ledgerOf(planted, { kind: 'algae', bloom: kind })!, 'held')).toMatchObject({
      text: String(Math.floor(held * 100)),
      note: 'by the planting',
    });
  });
});
