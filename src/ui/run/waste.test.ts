import { describe, it, expect } from 'vitest';
import { plantRecord } from '../../simulation/tests/plant.js';
import { bloomAt } from '../../simulation/tests/blooms.js';
import { produce } from 'immer';
import {
  wasteInflow,
  wasteLevel,
  wasteReadout,
  wasteSummary,
  type PoolRot,
  type WasteInflowReadout,
  type WasteReadout,
} from './waste';
import { readHourAhead } from './ahead.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  ALGAE_KINDS,
  applyAction,
  atRecipe,
  createSimulation,
  tick,
  type Organics,
  type SimulationState,
} from '../../simulation/index.js';
import { gutAt } from '../test/gut';

const config = DEFAULT_CONFIG;
const rot = (grams: number): Organics => atRecipe(grams, config);

function inflowOf(state: SimulationState): WasteInflowReadout {
  return wasteInflow(readHourAhead(state, config));
}

function readoutOf(state: SimulationState): WasteReadout {
  return wasteReadout(state, config, readHourAhead(state, config));
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

function soilTank(): SimulationState {
  return createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } });
}

function fed(oxygen: number): SimulationState {
  return produce(applyAction(tank(), { type: 'feed', amount: 2 }).state, (draft) => {
    draft.resources.oxygen = oxygen;
  });
}

function stocked(): SimulationState {
  let state = soilTank();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  const fed = applyAction(state, { type: 'feed', amount: 2 }).state;
  return { ...fed, fish: fed.fish.map((fish) => ({ ...fish, gut: gutAt(1, fish) })) };
}

function fadingBlooms(): SimulationState {
  return produce(soilTank(), (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 40, 50);
  });
}

describe('wasteInflow', () => {
  it('always names all three sources, in a fixed order', () => {
    expect(inflowOf(tank()).sources.map((s) => s.key)).toEqual(['fish', 'plants', 'algae']);
  });

  it('takes nothing from the bed or the food: mulm and food rot where they lie', () => {
    const state = produce(soilTank(), (draft) => void (draft.resources.food = rot(2)));
    expect(state.equipment.substrate.organicReserve.grams).toBeGreaterThan(0);
    expect(inflowOf(state).perHour).toBe(0);
  });

  it('counts what the plants shed on the hour ahead, not on the condition they stand at', () => {
    const planted = applyAction(soilTank(), { type: 'addPlant', species: 'java_fern' }).state;
    const dark = produce(planted, (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
      draft.plants[0].budget.reserve = 0;
    });
    const shed = (state: SimulationState): number =>
      inflowOf(state).sources.find((s) => s.key === 'plants')!.gramsPerHour;

    expect(dark.plants[0].condition).toBe(100);
    expect(shed(planted)).toBe(0);
    expect(shed(dark)).toBeGreaterThan(0);
  });

  it('counts what every bloom sheds on the hour ahead', () => {
    const fading = fadingBlooms();
    const shed = inflowOf(fading).sources.find((s) => s.key === 'algae')!.gramsPerHour;
    const { algae } = readHourAhead(fading, config);

    for (const kind of ALGAE_KINDS) expect(algae[kind].shedding.grams).toBeGreaterThan(0);
    expect(shed).toBeCloseTo(ALGAE_KINDS.reduce((sum, kind) => sum + algae[kind].shedding.grams, 0), 15);
  });

  it('counts a plant dying on the next tick at the rate it sheds, not the lump it leaves', () => {
    const fading = (condition: number): SimulationState =>
      produce(applyAction(soilTank(), { type: 'addPlant', species: 'java_fern' }).state, (draft) => {
        draft.equipment.light.enabled = false;
        draft.resources.lightByHour.fill(0);
        draft.plants[0].budget = { ...plantRecord({ id: 'fern', species: 'java_fern', size: 80 }).budget, reserve: 0 };
        draft.plants[0].condition = condition;
      });
    const shed = (state: SimulationState): number =>
      inflowOf(state).sources.find((s) => s.key === 'plants')!.gramsPerHour;
    const dying = fading(0.001);
    const failing = fading(1);

    expect(tick(dying, config).plants).toHaveLength(0);
    expect(tick(failing, config).plants).toHaveLength(1);
    expect(shed(dying)).toBeGreaterThan(0);
    expect(shed(dying) / shed(failing)).toBeCloseTo(1, 1);
  });

  it('counts fish feces once the fish have food to eat', () => {
    expect(inflowOf(stocked()).sources.find((s) => s.key === 'fish')!.gramsPerHour).toBeGreaterThan(0);
  });

  it('shares always add up to the hour’s production', () => {
    const inflow = inflowOf(stocked());
    const total = inflow.sources.reduce((sum, s) => sum + s.gramsPerHour, 0);
    expect(total).toBeCloseTo(inflow.perHour, 10);
    expect(inflow.sources.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10);
  });

  it('leaves every share at zero when nothing is produced', () => {
    const inflow = inflowOf(tank());
    expect(inflow.perHour).toBe(0);
    expect(inflow.sources.every((s) => s.share === 0)).toBe(true);
  });
});

describe('wasteReadout', () => {
  it('reports what the next tick rots and settles out of the pool alongside its inflow', () => {
    for (const setup of [tank, soilTank]) {
      const state = produce(setup(), (draft) => void (draft.resources.waste = rot(3)));
      const readout = readoutOf(state);
      expect(readout.standing).toBe(3);
      expect(readout.rotted).toBeGreaterThan(0);
      expect(readout.rotted + readout.settled).toBeCloseTo(3 - tick(state, config).resources.waste.grams, 10);
    }
  });

  it('carries the Q10 factor the card names beside the rate', () => {
    const state = tank();
    state.resources.temperature = config.decomposition.referenceTemp + 10;
    expect(readoutOf(state).q10).toBeCloseTo(config.decomposition.q10, 10);
  });

  const pool = (readout: WasteReadout, key: PoolRot['key']): PoolRot | undefined =>
    readout.pools.find((entry) => entry.key === key);

  it('reads the share of food the next tick actually rots and settles, at any oxygen', () => {
    for (const oxygen of [0, 0.2, 2, 8]) {
      const state = fed(oxygen);
      const lost = state.resources.food.grams - tick(state, config).resources.food.grams;
      const food = pool(readoutOf(state), 'food')!;
      expect((food.rots + food.settles) * state.resources.food.grams).toBeCloseTo(lost, 10);
    }
  });

  it('reads the oxygen each pool’s rot takes, which together the tick draws for rot', () => {
    const state = produce(soilTank(), (draft) => {
      draft.resources.food = rot(2);
      draft.resources.waste = rot(1);
    });
    const readout = readoutOf(state);
    const { rot: hours, water } = readHourAhead(state, config);

    expect(readout.pools.map((entry) => entry.key)).toEqual(['food', 'waste', 'mulm']);
    for (const entry of readout.pools) {
      expect(entry.oxygen).toBeGreaterThan(0);
      expect(entry.oxygen).toBeCloseTo(hours[entry.key].oxygen / water, 12);
      expect(entry.grams).toBe(hours[entry.key].met.grams);
    }
  });

  it('holds no mulm without a bed, and settles nothing into one', () => {
    const readout = readoutOf(fed(8));
    expect(pool(readout, 'mulm')).toBeUndefined();
    expect(readout.pools.every((entry) => entry.settles === 0)).toBe(true);
  });

  it('falls with the oxygen to the slower anaerobic pace, which rots on in anoxic water', () => {
    const rateAt = (oxygen: number): number => pool(readoutOf(fed(oxygen)), 'food')!.rots;
    expect(rateAt(0)).toBeGreaterThan(0);
    expect(rateAt(0)).toBeLessThan(rateAt(0.2));
    expect(rateAt(0.2)).toBeLessThan(rateAt(2));
    expect(rateAt(2)).toBeLessThan(rateAt(8));
  });
});

describe('wasteSummary', () => {
  it('says where the pool settles, and which way it is heading', () => {
    const standing = (waste: number): SimulationState =>
      produce(stocked(), (draft) => void (draft.resources.waste = rot(waste)));

    expect(wasteSummary(readoutOf(standing(0)))).toContain('climbing to');
    expect(wasteSummary(readoutOf(standing(10)))).toContain('falling to');
  });

  it.each([
    ['a fed, stocked tank', stocked],
    ['a tank of fading blooms', fadingBlooms],
  ])('names the level the engine holds the pool at, on %s', (_, setup) => {
    const state = setup();
    const readout = readoutOf(state);
    const level = wasteLevel(readout);
    const held = produce(state, (draft) => void (draft.resources.waste = rot(level)));

    expect(readout.lost).toBeGreaterThan(0);
    expect(wasteSummary(readout)).toContain(`${level.toFixed(3)} g.`);
    expect(Math.abs(tick(held, config).resources.waste.grams - level)).toBeLessThan(readout.perHour * 0.01);
  });

  it('counts what settles into the bed as an outflow of the pool', () => {
    const state = soilTank();
    state.resources.waste = rot(1);
    const ahead = readHourAhead(state, config);
    const readout = wasteReadout(state, config, ahead);
    expect(readout.settled).toBeGreaterThan(0);
    expect(readout.settled).toBeCloseTo((readout.standing + readout.perHour) * ahead.rot.waste.shares.settling, 12);
    expect(readoutOf(tank()).settled).toBe(0);
  });

  it('says so plainly when nothing produces waste at all', () => {
    expect(wasteSummary(readoutOf(tank()))).toBe('Nothing is producing waste.');
  });
});
