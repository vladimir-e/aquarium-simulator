import { describe, it, expect } from 'vitest';
import { wasteInflow, wasteReadout, wasteSummary } from './waste';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  calculateDecay,
  createSimulation,
  getTemperatureFactor,
  type SimulationState,
} from '../../simulation/index.js';

const config = DEFAULT_CONFIG;

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

function stocked(): SimulationState {
  let state = tank();
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
      'ambient',
    ]);
  });

  it('is ambient-only on a tank with no food, fish or plants', () => {
    const inflow = wasteInflow(tank(), config);
    expect(inflow.perHour).toBeCloseTo(config.decay.ambientWaste, 10);
    expect(inflow.sources.find((s) => s.key === 'ambient')?.share).toBe(1);
    expect(inflow.sources.find((s) => s.key === 'food')?.gramsPerHour).toBe(0);
  });

  it('takes food decay straight from the engine’s decay curve', () => {
    const state = stocked();
    const expected =
      calculateDecay(state.resources.food, state.resources.temperature, config.decay) *
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
    const state = tank();
    const bare = { ...config, decay: { ...config.decay, ambientWaste: 0 } };
    const inflow = wasteInflow(state, bare);
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

  it('carries the Q10 factor and the decay rate it produces', () => {
    const state = tank();
    state.resources.temperature = config.decay.referenceTemp + 10;
    const readout = wasteReadout(state, config);
    expect(readout.q10).toBeCloseTo(config.decay.q10, 10);
    expect(readout.decayRate).toBeCloseTo(
      config.decay.baseDecayRate * getTemperatureFactor(state.resources.temperature, config.decay),
      10
    );
  });
});

describe('wasteSummary', () => {
  it('says where the pool settles, and which way it is heading', () => {
    const state = tank();
    state.resources.waste = 0;
    expect(wasteSummary(wasteReadout(state, config), config)).toContain('climbing to');

    state.resources.waste = 10;
    expect(wasteSummary(wasteReadout(state, config), config)).toContain('falling to');
  });

  it('reads the settled mass as production over the mineralisation rate', () => {
    const state = tank();
    const readout = wasteReadout(state, config);
    const settled = readout.perHour / config.nitrogenCycle.wasteConversionRate;
    expect(wasteSummary(readout, config)).toContain(settled.toFixed(3));
  });

  it('says so plainly when nothing produces waste at all', () => {
    const state = tank();
    const bare = { ...config, decay: { ...config.decay, ambientWaste: 0 } };
    expect(wasteSummary(wasteReadout(state, bare), bare)).toBe('Nothing is producing waste.');
  });
});
