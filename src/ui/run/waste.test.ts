import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  wasteInflow,
  wasteLevel,
  wasteReadout,
  wasteSummary,
  type WasteInflowReadout,
  type WasteReadout,
} from './waste';
import { readHourAhead } from './ahead.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  calculateDecay,
  calculateSubstrateLeach,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';

const config = DEFAULT_CONFIG;

function inflowOf(state: SimulationState): WasteInflowReadout {
  return wasteInflow(state, config, readHourAhead(state, config));
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
  return applyAction(state, { type: 'feed', amount: 2 }).state;
}

describe('wasteInflow', () => {
  it('always names all five sources, in a fixed order', () => {
    expect(inflowOf(tank()).sources.map((s) => s.key)).toEqual([
      'food',
      'fish',
      'plants',
      'algae',
      'substrate',
    ]);
  });

  it('is substrate-only on a soil tank with no food, fish or plants', () => {
    const state = soilTank();
    const inflow = inflowOf(state);
    const leach = calculateSubstrateLeach(
      state.equipment.substrate.organicReserve,
      config.decay
    );
    expect(inflow.perHour).toBeCloseTo(leach, 10);
    expect(inflow.sources.find((s) => s.key === 'substrate')?.share).toBe(1);
    expect(inflow.sources.find((s) => s.key === 'food')?.gramsPerHour).toBe(0);
  });

  it('decays only the food the next hour’s fish leave, as the tick does', () => {
    const state = stocked();
    const standing =
      calculateDecay(
        state.resources.food,
        state.resources.temperature,
        state.resources.oxygen,
        config.decay
      ) * config.decay.wasteConversionRatio;
    const food = inflowOf(state).sources[0].gramsPerHour;

    expect(food).toBe(readHourAhead(state, config).foodWaste);
    expect(food).toBeGreaterThan(0);
    expect(food).toBeLessThan(standing);
  });

  it('counts what the plants shed on the hour ahead, not on the condition they stand at', () => {
    const planted = applyAction(soilTank(), { type: 'addPlant', species: 'java_fern' }).state;
    const dark = produce(planted, (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
    });
    const shed = (state: SimulationState): number =>
      inflowOf(state).sources.find((s) => s.key === 'plants')!.gramsPerHour;

    expect(dark.plants[0].condition).toBe(100);
    expect(shed(planted)).toBe(0);
    expect(shed(dark)).toBeGreaterThan(0);
  });

  it('counts what the bloom sheds on the hour ahead', () => {
    const fading = produce(soilTank(), (draft) => {
      draft.algae = { mass: 40, condition: 50, surplus: 0 };
    });
    const shed = inflowOf(fading).sources.find((s) => s.key === 'algae')!.gramsPerHour;

    expect(shed).toBeGreaterThan(0);
    expect(shed).toBe(readHourAhead(fading, config).algae.shedding);
  });

  it('counts a plant dying on the next tick at the rate it sheds, not the lump it leaves', () => {
    const fading = (condition: number): SimulationState =>
      produce(applyAction(soilTank(), { type: 'addPlant', species: 'java_fern' }).state, (draft) => {
        draft.equipment.light.enabled = false;
        draft.resources.lightByHour.fill(0);
        draft.plants[0].size = 80;
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
    expect(inflowOf(stocked()).sources[1].gramsPerHour).toBeGreaterThan(0);
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
  it('reports the pool’s only outflow alongside its inflow', () => {
    const state = tank();
    state.resources.waste = 3;
    const readout = readoutOf(state);
    expect(readout.standing).toBe(3);
    expect(readout.mineralised).toBeCloseTo(3 * config.nitrogenCycle.wasteConversionRate, 10);
  });

  it('carries the Q10 factor the card names beside the rate', () => {
    const state = tank();
    state.resources.temperature = config.decay.referenceTemp + 10;
    expect(readoutOf(state).q10).toBeCloseTo(config.decay.q10, 10);
  });

  it('reads the share of food the next tick actually decays, at any oxygen', () => {
    for (const oxygen of [0, 0.2, 2, 8]) {
      const state = fed(oxygen);
      const decayed = state.resources.food - tick(state, config).resources.food;
      expect(readoutOf(state).decayRate * state.resources.food).toBeCloseTo(
        decayed,
        10
      );
    }
  });

  it('falls with the oxygen, to nothing at all once there is none', () => {
    const rateAt = (oxygen: number): number => readoutOf(fed(oxygen)).decayRate;
    expect(rateAt(0)).toBe(0);
    expect(rateAt(0.2)).toBeLessThan(rateAt(2));
    expect(rateAt(2)).toBeLessThan(rateAt(8));
  });
});

describe('wasteSummary', () => {
  it('says where the pool settles, and which way it is heading', () => {
    const standing = (waste: number): SimulationState =>
      produce(soilTank(), (draft) => void (draft.resources.waste = waste));

    expect(wasteSummary(readoutOf(standing(0)), config)).toContain('climbing to');
    expect(wasteSummary(readoutOf(standing(10)), config)).toContain('falling to');
  });

  it.each([
    ['a bare soil tank', soilTank],
    ['a fed, stocked tank', stocked],
  ])('names the level the engine holds the pool at, on %s', (_, setup) => {
    const state = setup();
    const readout = readoutOf(state);
    const level = wasteLevel(readout, config);
    const held = produce(state, (draft) => void (draft.resources.waste = level));

    expect(readout.settlingShare).toBeGreaterThan(0);
    expect(wasteSummary(readout, config)).toContain(`${level.toFixed(3)} g.`);
    expect(Math.abs(tick(held, config).resources.waste - level)).toBeLessThan(readout.perHour * 0.01);
  });

  it('counts what settles into the bed as an outflow of the pool', () => {
    const state = soilTank();
    state.resources.waste = 1;
    const readout = readoutOf(state);
    expect(readout.settled).toBeCloseTo(readout.settlingShare, 12);
    expect(readoutOf(produce(state, (d) => void (d.resources.waste = 2))).settled).toBeCloseTo(
      2 * readout.settled,
      12
    );
  });

  it('says so plainly when nothing produces waste at all', () => {
    expect(wasteSummary(readoutOf(tank()), config)).toBe(
      'Nothing is producing waste.'
    );
  });
});
