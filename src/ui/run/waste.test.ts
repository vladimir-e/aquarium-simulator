import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { wasteInflow, wasteReadout, wasteSummary } from './waste';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  calculateDecay,
  calculateSubstrateLeach,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { fishlessTank } from '../../simulation/tests/tanks.js';

const config = DEFAULT_CONFIG;

/** Bare bottom: no substrate reserve, so nothing produces waste on its own. */
function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

/**
 * Food standing in a bare tank at a chosen dissolved oxygen. Nothing here moves
 * oxygen before the passive tier, so decay reads the same figure the card does.
 */
function fed(oxygen: number): SimulationState {
  return produce(applyAction(tank(), { type: 'feed', amount: 2 }).state, (draft) => {
    draft.resources.oxygen = oxygen;
  });
}

function stocked(): SimulationState {
  let state = fishlessTank('aqua_soil', { capacity: 200, ato: false });
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  return applyAction(state, { type: 'feed', amount: 2 }).state;
}

describe('wasteInflow', () => {
  it('always names all four sources, in a fixed order', () => {
    expect(wasteInflow(tank(), config).sources.map((s) => s.key)).toEqual([
      'food',
      'fish',
      'plants',
      'substrate',
    ]);
  });

  it('is substrate-only on a soil tank with no food, fish or plants', () => {
    const state = fishlessTank('aqua_soil', { capacity: 200, ato: false });
    const inflow = wasteInflow(state, config);
    const leach = calculateSubstrateLeach(
      state.equipment.substrate.organicReserve,
      config.decay
    );
    expect(inflow.perHour).toBeCloseTo(leach, 10);
    expect(inflow.sources.find((s) => s.key === 'substrate')?.share).toBe(1);
    expect(inflow.sources.find((s) => s.key === 'food')?.gramsPerHour).toBe(0);
  });

  it('takes food decay straight from the engine’s decay curve', () => {
    const state = stocked();
    const expected =
      calculateDecay(
        state.resources.food,
        state.resources.temperature,
        state.resources.oxygen,
        config.decay
      ) *
      config.decay.wasteConversionRatio;
    expect(wasteInflow(state, config).sources[0].gramsPerHour).toBeCloseTo(expected, 10);
  });

  it('counts fish feces once the fish have food to eat', () => {
    expect(wasteInflow(stocked(), config).sources[1].gramsPerHour).toBeGreaterThan(0);
  });

  it('shares always add up to the hour’s production', () => {
    const inflow = wasteInflow(stocked(), config);
    const total = inflow.sources.reduce((sum, s) => sum + s.gramsPerHour, 0);
    expect(total).toBeCloseTo(inflow.perHour, 10);
    expect(inflow.sources.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10);
  });

  it('leaves every share at zero when nothing is produced', () => {
    const inflow = wasteInflow(tank(), config);
    expect(inflow.perHour).toBe(0);
    expect(inflow.sources.every((s) => s.share === 0)).toBe(true);
  });
});

describe('wasteReadout', () => {
  it('reports the pool’s only outflow alongside its inflow', () => {
    const state = tank();
    state.resources.waste = 3;
    const readout = wasteReadout(state, config);
    expect(readout.standing).toBe(3);
    expect(readout.mineralised).toBeCloseTo(3 * config.nitrogenCycle.wasteConversionRate, 10);
  });

  it('carries the Q10 factor the card names beside the rate', () => {
    const state = tank();
    state.resources.temperature = config.decay.referenceTemp + 10;
    expect(wasteReadout(state, config).q10).toBeCloseTo(config.decay.q10, 10);
  });

  it('reads the share of food the next tick actually decays, at any oxygen', () => {
    for (const oxygen of [0, 0.2, 2, 8]) {
      const state = fed(oxygen);
      const decayed = state.resources.food - tick(state, config).resources.food;
      expect(wasteReadout(state, config).decayRate * state.resources.food).toBeCloseTo(
        decayed,
        10
      );
    }
  });

  it('falls with the oxygen, to nothing at all once there is none', () => {
    const rateAt = (oxygen: number): number => wasteReadout(fed(oxygen), config).decayRate;
    expect(rateAt(0)).toBe(0);
    expect(rateAt(0.2)).toBeLessThan(rateAt(2));
    expect(rateAt(2)).toBeLessThan(rateAt(8));
  });
});

describe('wasteSummary', () => {
  it('says where the pool settles, and which way it is heading', () => {
    const state = fishlessTank('aqua_soil', { capacity: 200, ato: false });
    state.resources.waste = 0;
    expect(wasteSummary(wasteReadout(state, config), config)).toContain('climbing to');

    state.resources.waste = 10;
    expect(wasteSummary(wasteReadout(state, config), config)).toContain('falling to');
  });

  it('reads the settled mass as production over the mineralisation rate', () => {
    const readout = wasteReadout(fishlessTank('aqua_soil', { capacity: 200, ato: false }), config);
    const settled = readout.perHour / config.nitrogenCycle.wasteConversionRate;
    expect(wasteSummary(readout, config)).toContain(settled.toFixed(3));
  });

  it('says so plainly when nothing produces waste at all', () => {
    expect(wasteSummary(wasteReadout(tank(), config), config)).toBe(
      'Nothing is producing waste.'
    );
  });
});
