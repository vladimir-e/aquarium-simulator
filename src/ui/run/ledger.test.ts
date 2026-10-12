import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  ALGAE_KINDS,
  applyAction,
  bloomParams,
  createSimulation,
  fillAtDroop,
  fullDroopFactor,
  getPresetById,
  NO_ORGANICS,
  plantLightTaken,
  plantParams,
  starvation,
  storeFill,
  tick,
  waterToxins,
  wellFed,
  type Fish,
  type FloraState,
  type SimulationState,
} from '../../simulation/index.js';
import { mapNutrients, NUTRIENTS } from '../../simulation/config/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';
import { bloomAt } from '../../simulation/tests/blooms.js';
import { bloomCoverage } from '../../simulation/algae/index.js';
import { offshootStructure } from '../../simulation/plants/create-plant.js';
import { atSize, withBudget } from '../../simulation/tests/plant.js';
import { LEDGER_DECIMALS, readLedger, type BudgetRow, type Ledger, type LedgerTarget } from './ledger.js';
import { FED, atReserve, starving } from '../test/gut';
import { projectedTrend } from './status.js';
import { TRACK_PAST_LINE, WATER_DECIMALS } from './water.js';
import { fishRecord, holdingEggs, poisoned, saturated } from '../../simulation/tests/fish.js';
import { spawnsAt } from '../../simulation/systems/brood.js';
import { fishHardiness, toxinEdges } from '../../simulation/livestock/tolerance.js';

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
    const state = tank([starving(makeFish({ id: 'fish_a_1', gut: NO_ORGANICS }))], 20);
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
      tank([starving(makeFish({ id: 'fish_a_1', gut: NO_ORGANICS }))], 20),
    ]) {
      const ledger = fishLedger(state);
      expect(ledger.helps - ledger.hurts).toBeCloseTo(ledger.net, 6);
    }
  });

  it('sorts each column worst-first, so the reason is the top line', () => {
    const ledger = fishLedger(tank([starving(makeFish({ id: 'fish_a_1', gut: NO_ORGANICS }))], 20));
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
    expect(reserveOf(fishLedger(tank([{ ...makeFish({ id: 'fish_a_1' }), gut: NO_ORGANICS }]))).note).toBe('drawing down');
    expect(reserveOf(fishLedger(tank([makeFish({ id: 'fish_a_1', health: 80 })]))).note).toBe('healing from reserve');
    expect(reserveOf(fishLedger(tank([starving(makeFish({ id: 'fish_a_1', gut: NO_ORGANICS }))]))).note).toBe('short of upkeep');
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

  const edge = toxinEdges(fishHardiness(makeFish())).nitrite;
  const ppm = (value: number): string => value.toFixed(WATER_DECIMALS.nitrite);
  const inNitrite = (state: SimulationState, level: number): SimulationState => ({
    ...state,
    resources: { ...state.resources, nitrite: level * state.resources.water },
  });
  const carriedNitrite = (state: SimulationState): number => readHourAhead(state, DEFAULT_CONFIG).fish[0].hour.fish.load.nitrite;

  it('reads each toxin the fish carries beside its water’s level, on a track to twice its own edge, coral past it', () => {
    const steeped = (nitrite: number): SimulationState => saturated(inNitrite(tank([makeFish({ id: 'fish_a_1' })]), nitrite));

    const state = steeped(1.5 * edge);
    const past = fishLedger(state).load;
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      key: 'nitrite',
      text: ppm(1.5 * edge),
      unit: 'ppm',
      band: { from: 0, to: 1 / TRACK_PAST_LINE },
      status: 'alert',
      note: `water ${ppm(1.5 * edge)}`,
    });
    expect(past[0].at).toBeCloseTo(carriedNitrite(state) / (TRACK_PAST_LINE * edge), 12);
    expect(fishLedger(steeped(0.5 * edge)).load[0]).toMatchObject({ status: 'ok' });
  });

  it('reads the load the hour carries the fish to, so a row turns coral the hour its load crosses, beside the charge', () => {
    const level = 5 * edge;
    const state = inNitrite(tank([makeFish({ id: 'fish_a_1', load: { ammonia: 0, nitrite: 0.9 * edge, nitrate: 0 } })]), level);
    const carried = carriedNitrite(state);
    const ledger = fishLedger(state);

    expect(carried).toBeGreaterThan(edge);
    expect(ledger.load[0]).toMatchObject({ key: 'nitrite', text: ppm(carried), status: 'alert', note: `water ${ppm(level)}` });
    expect(ledger.load[0].at).toBeCloseTo(carried / (TRACK_PAST_LINE * edge), 12);
    expect(ledger.hurting.map((factor) => factor.key)).toContain('nitrite');
  });

  it('reads the ammonia row’s water as its free share, where the Water page reads the total', () => {
    const state = poisoned(tank([makeFish({ id: 'fish_a_1' })]), 2);
    const free = waterToxins(state.resources).ammonia.toFixed(WATER_DECIMALS.ammonia);

    expect(fishLedger(state).load.find((row) => row.key === 'ammonia')).toMatchObject({ note: `water ${free}` });
  });

  it('reads a toxin its water holds though the fish carries none that prints', () => {
    const fresh = tank([makeFish({ id: 'fish_a_1' })]);
    const state = { ...fresh, resources: { ...fresh.resources, nitrate: 0.5 * fresh.resources.water } };

    expect(fishLedger(state).load).toEqual([expect.objectContaining({ key: 'nitrate', text: '0.0', note: 'water 0.5' })]);
  });

  it('reads no load where neither the fish nor its water holds any toxin that prints', () => {
    expect(fishLedger(tank([makeFish({ id: 'fish_a_1' })])).load).toEqual([]);
  });

  it('reads what the load costs: the share of appetite its stress holds back, only while it holds any back', () => {
    const loaded = tank([makeFish({ id: 'fish_a_1', load: { ammonia: 0.2, nitrite: 5, nitrate: 0 } })]);
    const { assimilation } = readHourAhead(loaded, DEFAULT_CONFIG).fish[0].hour.pace.stress;

    expect(assimilation).toBeLessThan(0.99);
    expect(line(fishLedger(loaded), 'load')).toMatchObject({
      label: 'Held back by its load',
      text: String(100 - Math.floor(assimilation * 100)),
      unit: '% of appetite',
      status: 'warn',
    });
    expect(line(fishLedger(tank([makeFish({ id: 'fish_a_1' })])), 'load')).toBeUndefined();
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
        plants: state.plants.map((plant) => withBudget(plant, { offshootBuffer: buffer })),
      };
    };
    const plantLedger = (state: SimulationState): Ledger =>
      ledgerOf(state, { kind: 'plant', id: state.plants[0].id })!;
    const offshoot = (state: SimulationState): BudgetRow => line(plantLedger(state), 'offshoot')!;
    const withBudgets = (state: SimulationState, budget: Partial<FloraState>): SimulationState => ({
      ...state,
      plants: state.plants.map((plant) => withBudget(plant, budget)),
    });
    const unfedInTheDark = (state: SimulationState): SimulationState => ({
      ...withBudgets(state, { reserve: 0 }),
      equipment: { ...state.equipment, light: { ...state.equipment.light, enabled: false } },
      resources: { ...state.resources, lightByHour: state.resources.lightByHour.map(() => 0) },
    });
    const fern = plantParams('java_fern', DEFAULT_CONFIG.plants);

    it('reads its reserve as the fish’s is read, filling or drawing down by the hour’s fluxes', () => {
      for (const state of [planted(10), planted(0), withBudgets(planted(10), { reserve: 0 })]) {
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
      expect(offshoot(planted(10))).toMatchObject({ label: 'Plantlet', at: 0, unit: '% built' });
      const full = planted(10, 1.01 * offshootStructure('java_fern'));
      expect(tick(full, DEFAULT_CONFIG).plants).toHaveLength(2);
      expect(offshoot(full)).toMatchObject({ at: 1, note: 'cuts loose this hour' });
    });

    it('names the plantlet by what the next tick does to its buffer', () => {
      const unit = offshootStructure('java_fern');
      const states = [planted(10, unit / 2), planted(0, unit / 2), planted(10, 1.01 * unit), unfedInTheDark(planted(0, unit / 2))];
      const notes = states.map((state) => {
        const next = tick(state, DEFAULT_CONFIG);
        const moved = next.plants[0].budget.offshootBuffer - state.plants[0].budget.offshootBuffer;
        const { note } = offshoot(state);
        if (next.plants.length > state.plants.length) expect(note).toBe('cuts loose this hour');
        else if (moved > 0) expect(note).toMatch(/^cuts loose (in \d+ d|within a day)$/);
        else expect(note).toBe('paying upkeep');
        return note.replace(/ in \d+ d$/, '');
      });
      expect(new Set(notes)).toEqual(new Set(['cuts loose', 'cuts loose this hour', 'paying upkeep']));
    });

    it('waits on stores while an empty store lets the buffer fill no further, or a full one cannot pay an offshoot’s Q_min', () => {
      const unit = offshootStructure('java_fern');
      const ironless = (state: SimulationState): SimulationState => ({
        ...withBudgets(state, { stores: { ...state.plants[0].budget.stores, iron: 0 } }),
        resources: { ...state.resources, iron: 0 },
      });
      const dry = ironless(planted(10, unit / 2));
      expect(tick(dry, DEFAULT_CONFIG).plants[0].budget.offshootBuffer).toBe(unit / 2);
      expect(offshoot(dry).note).toBe('waiting on stores');

      const held = ironless(planted(10, 1.01 * unit));
      expect(tick(held, DEFAULT_CONFIG).plants).toHaveLength(1);
      expect(offshoot(held).note).toBe('waiting on stores');
    });

    it('waits on stores rather than name a day past a year off, and on the reserve while it starves with nothing in the buffer', () => {
      const unit = offshootStructure('java_fern');
      const lean = (state: SimulationState): SimulationState => ({
        ...withBudgets(state, { stores: { nitrate: 1e-9, phosphate: 1e-9, potassium: 1e-9, iron: 1e-9 } }),
        resources: { ...state.resources, nitrate: 0, phosphate: 0, potassium: 0, iron: 0, ammonia: 0 },
      });
      const crawling = lean(planted(10, unit / 2));
      const gained = tick(crawling, DEFAULT_CONFIG).plants[0].budget.offshootBuffer - unit / 2;
      expect(gained).toBeGreaterThan(0);
      expect((unit / 2 - gained) / gained).toBeGreaterThan(365 * 24);
      expect(offshoot(crawling).note).toBe('waiting on stores');

      const empty = unfedInTheDark(planted(0));
      expect(starvation(readHourAhead(empty, DEFAULT_CONFIG).plants[0])).toBeGreaterThan(0);
      expect(offshoot(empty).note).toBe('waiting on reserve');
    });

    it('reads each store’s fill, full at 100, banded from the fill its Droop edge sits at and coral under it', () => {
      const lean = withBudgets(planted(10), {
        stores: { ...planted(10).plants[0].budget.stores, phosphate: 0.05 * fern.qMin.phosphate * planted(10).plants[0].budget.structure },
      });
      const { budget } = lean.plants[0];
      const fill = storeFill(budget, fern);
      const edge = fillAtDroop(fern, DEFAULT_CONFIG.plants.droopEdge);
      const { stores } = plantLedger(lean);

      expect(stores.map((row) => row.key)).toEqual([...NUTRIENTS]);
      for (const row of stores) {
        const n = row.key as (typeof NUTRIENTS)[number];
        expect(row.text).toBe(String(Math.floor(Math.min(1, fill[n]) * 100)));
        expect(row.band!.from).toBeCloseTo(edge[n], 12);
        expect(row.status).toBe(fill[n] < edge[n] ? 'alert' : 'ok');
      }
      expect(stores.filter((row) => row.status === 'alert').map((row) => row.key)).toEqual(['phosphate']);

      const overfull = withBudgets(planted(10), {
        stores: mapNutrients((n) => 1.5 * (fern.qMax[n] - fern.qMin[n]) * planted(10).plants[0].budget.structure),
      });
      expect(plantLedger(overfull).stores.map((row) => [row.text, row.at])).toEqual(NUTRIENTS.map(() => ['100', 1]));
    });

    it('notes on the store that rules the pace its Droop limit held growth to against full stores, only while it holds growth back', () => {
      const growth = (state: SimulationState): number =>
        readHourAhead(state, DEFAULT_CONFIG).plants[0].fluxes.droopLimit / fullDroopFactor(fern);
      const noted = (state: SimulationState): BudgetRow[] => plantLedger(state).stores.filter((row) => row.note !== '');
      const grown = { ...planted(10), plants: planted(10).plants.map((plant) => atSize(plant, 100)) };

      for (const state of [planted(10), grown]) {
        expect(growth(state)).toBeGreaterThanOrEqual(0.99);
        expect(noted(state)).toEqual([]);
      }

      const lean = withBudgets(planted(10), {
        stores: { ...planted(10).plants[0].budget.stores, phosphate: 0.05 * fern.qMin.phosphate * planted(10).plants[0].budget.structure },
      });
      expect(growth(lean)).toBeLessThan(0.99);
      expect(noted(lean)).toEqual([
        expect.objectContaining({ key: 'phosphate', note: `holds growth to ${Math.floor(growth(lean) * 100)} %` }),
      ]);
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
      expect(ledger.coverage!.note).toBe(projectedTrend(bloomCoverage(next, kind) - bloomCoverage(state, kind)));
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

  it.each(ALGAE_KINDS)('reads %s’s reserve and stores, no plantlet, and the hold the planting’s exudates had on it while they have one', (kind) => {
    const bare = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.algae[kind] = bloomAt(draft, kind, 20);
    });
    const planted = applyAction(bare, { type: 'addPlant', species: 'amazon_sword' }).state;
    const p = bloomParams(kind, DEFAULT_CONFIG.plants);

    const alone = ledgerOf(bare, { kind: 'algae', bloom: kind })!;
    expect(reserveOf(alone).at).toBeCloseTo(wellFed(bare.algae[kind].budget, p), 12);
    expect(alone.stores.map((row) => row.text)).toEqual(
      NUTRIENTS.map((n) => String(Math.floor(Math.min(1, storeFill(bare.algae[kind].budget, p)[n]) * 100)))
    );
    expect(line(alone, 'offshoot')).toBeUndefined();
    expect(readHourAhead(bare, DEFAULT_CONFIG).algae[kind].allelopathy).toBe(1);
    expect(line(alone, 'allelopathy')).toBeUndefined();

    const { allelopathy } = readHourAhead(planted, DEFAULT_CONFIG).algae[kind];
    expect(allelopathy).toBeLessThan(0.99);
    expect(line(ledgerOf(planted, { kind: 'algae', bloom: kind })!, 'allelopathy')).toMatchObject({
      label: 'Held back by exudates',
      text: String(100 - Math.floor(allelopathy * 100)),
      unit: '%',
    });
  });

  it.each(ALGAE_KINDS)('notes on %s’s ruling store the pace its Droop limit held growth to, and nothing of how crowded it is', (kind) => {
    const crowded = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.algae[kind] = bloomAt(draft, kind, 20);
    });
    const p = bloomParams(kind, DEFAULT_CONFIG.plants);
    const growth = (state: SimulationState): number =>
      readHourAhead(state, DEFAULT_CONFIG).algae[kind].fluxes.droopLimit / fullDroopFactor(p);
    const noted = (state: SimulationState): BudgetRow[] =>
      ledgerOf(state, { kind: 'algae', bloom: kind })!.stores.filter((row) => row.note !== '');

    expect(growth(crowded)).toBeGreaterThanOrEqual(0.99);
    expect(noted(crowded)).toEqual([]);

    const lean = produce(crowded, (draft) => {
      draft.algae[kind].budget.stores.iron *= 0.02;
    });
    expect(growth(lean)).toBeLessThan(0.99);
    expect(noted(lean)).toEqual([
      expect.objectContaining({ key: 'iron', note: `holds growth to ${Math.floor(growth(lean) * 100)} %` }),
    ]);
  });
});
