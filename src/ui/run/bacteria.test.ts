import { describe, it, expect } from 'vitest';
import {
  bacteriaReadout,
  bacteriaSummary,
  biofilterColonisation,
  projectNitritePeak,
} from './bacteria';
import { DEFAULT_CONFIG, nitrogenCycleDefaults } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';

const config = DEFAULT_CONFIG;
const perCm2 = nitrogenCycleDefaults.bacteriaPerCm2;

function resources(aob: number, nob: number, surface: number): Resources {
  return { aob, nob, surface } as Resources;
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

/** A stocked, fed tank run far enough that both colonies are working. */
function cycling(hours: number): SimulationState {
  let state = tank();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  for (let hour = 0; hour < hours; hour++) {
    if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 0.5 }).state;
    state = tick(state, config);
  }
  return state;
}

describe('biofilterColonisation', () => {
  it('reads both colonies against their combined ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
    expect(biofilterColonisation(resources(ceiling, 0, 1000), nitrogenCycleDefaults)).toBe(50);
  });

  it('is zero on a tank with no colonisable surface', () => {
    expect(biofilterColonisation(resources(0, 0, 0), nitrogenCycleDefaults)).toBe(0);
  });

  it('clamps a colony that overshoots its ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling * 4, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
  });
});

describe('bacteriaReadout', () => {
  it('measures each colony against its own ceiling, not the combined one', () => {
    const state = tank();
    const ceiling = state.resources.surface * perCm2;
    state.resources.aob = ceiling;
    state.resources.nob = ceiling / 2;

    const readout = bacteriaReadout(state, config);
    expect(readout.aob.ceiling).toBeCloseTo(ceiling, 6);
    expect(readout.aob.pct).toBeCloseTo(100, 6);
    expect(readout.nob.pct).toBeCloseTo(50, 6);
    expect(readout.colonisation).toBeCloseTo(75, 6);
    expect(readout.surface).toBe(state.resources.surface);
  });

  it('calls a fresh tank uncycled and a colonised one cycled', () => {
    expect(bacteriaReadout(tank(), config).cycled).toBe(false);

    const state = tank();
    state.resources.aob = state.resources.surface * perCm2;
    state.resources.nob = state.resources.surface * perCm2;
    expect(bacteriaReadout(state, config).cycled).toBe(true);
  });

  it('reports no conversion at all on a tank with nothing in it', () => {
    const { rates } = bacteriaReadout(tank(), config);
    expect(rates.wasteToAmmonia).toBe(0);
    expect(rates.gillsToAmmonia).toBe(0);
    expect(rates.ammoniaToNitrite).toBe(0);
    expect(rates.netNitrite).toBe(0);
  });

  it('nets nitrite as what AOB produce minus what NOB clear', () => {
    const state = cycling(24 * 10);
    const { rates } = bacteriaReadout(state, config);
    expect(rates.netNitrite).toBeCloseTo(rates.ammoniaToNitrite - rates.nitriteToNitrate, 12);
  });

  it('separates gill excretion from mineralised waste', () => {
    const state = cycling(24 * 3);
    expect(bacteriaReadout(state, config).rates.gillsToAmmonia).toBeGreaterThan(0);
  });

  it('nets nitrite the way the next tick actually moves it, climbing and falling', () => {
    for (const days of [9, 16]) {
      const state = cycling(24 * days);
      const { rates } = bacteriaReadout(state, config);
      const moved =
        (tick(state, config).resources.nitrite - state.resources.nitrite) / state.resources.water;

      expect(Math.sign(rates.netNitrite)).toBe(Math.sign(moved));
      expect(rates.netNitrite).toBeCloseTo(moved, 3);
    }
  });
});

describe('projectNitritePeak', () => {
  it('finds a peak the engine then actually reaches', () => {
    const state = cycling(24 * 9);
    const projection = projectNitritePeak(state, config);
    expect(projection).not.toBeNull();

    let running = state;
    let observed = 0;
    for (let hour = 0; hour < projection!.hours * 2; hour++) {
      running = tick(running, config);
      observed = Math.max(observed, running.resources.nitrite / running.resources.water);
    }
    // The projection holds waste inflow and volume steady, so it lands near the
    // simulated peak rather than on it.
    expect(observed).toBeGreaterThan(projection!.ppm * 0.4);
  });

  it('gives up rather than guessing when nothing is driving the cycle', () => {
    const state = tank();
    expect(projectNitritePeak(state, config, 24)).toBeNull();
  });

  it('cannot project a tank with no water or no surface', () => {
    const dry = tank();
    dry.resources.water = 0;
    expect(projectNitritePeak(dry, config)).toBeNull();

    const bare = tank();
    bare.resources.surface = 0;
    expect(projectNitritePeak(bare, config)).toBeNull();
  });
});

describe('bacteriaSummary', () => {
  const nc = config.nitrogenCycle;

  it('explains an uncycled tank by the threshold AOB are waiting for', () => {
    const state = tank();
    const summary = bacteriaSummary(
      bacteriaReadout(state, config),
      projectNitritePeak(state, config, 24),
      nc
    );
    expect(summary).toContain('Uncycled');
    expect(summary).toContain(`${nc.aobSpawnThreshold} ppm`);
    expect(summary).toContain('No nitrite peak within');
  });

  it('blames the lagging colony while nitrite is climbing', () => {
    const state = cycling(24 * 9);
    const readout = bacteriaReadout(state, config);
    expect(readout.rates.netNitrite).toBeGreaterThan(0);
    expect(readout.nob.pct).toBeLessThan(readout.aob.pct);

    const summary = bacteriaSummary(readout, projectNitritePeak(state, config), nc);
    expect(summary).toContain('NOB trail AOB by');
    expect(summary).toContain('Nitrite peaks in');
  });

  it('reports a biofilter that keeps up', () => {
    const state = tank();
    state.resources.aob = state.resources.surface * perCm2;
    state.resources.nob = state.resources.surface * perCm2;
    const summary = bacteriaSummary(bacteriaReadout(state, config), null, nc);
    expect(summary).toContain('ceiling');
  });

  it('reports a colony still climbing toward its ceiling as clearing what it makes', () => {
    const state = tank();
    state.resources.aob = state.resources.surface * perCm2 * 0.5;
    state.resources.nob = state.resources.surface * perCm2 * 0.5;
    expect(bacteriaSummary(bacteriaReadout(state, config), null, nc)).toContain('clearing nitrite');
  });
});
