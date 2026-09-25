import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  bacteriaReadout,
  bacteriaSummary,
  biofilterColonisation,
  colonyCount,
  projectNitritePeak,
  type CycleProjection,
} from './bacteria';
import { DEFAULT_CONFIG, nitrogenCycleDefaults } from '../../simulation/config/index.js';
import { NH3_TO_NO2_MASS_RATIO, NO2_TO_NO3_MASS_RATIO } from '../../simulation/core/chemistry.js';
import {
  applyAction,
  createSimulation,
  tick,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import { getMassFromPpm } from '../../simulation/resources/index.js';

const config = DEFAULT_CONFIG;
const perCm2 = nitrogenCycleDefaults.bacteriaPerCm2;
const RNG_SEED = 2026;

function resources(aob: number, nob: number, surface: number): Resources {
  return { aob, nob, surface } as Resources;
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 }, undefined, RNG_SEED);
}

function soilTank({ ato = false } = {}): SimulationState {
  return createSimulation(
    { tankCapacity: 200, substrate: { type: 'aqua_soil' }, ato: { enabled: ato } },
    undefined,
    RNG_SEED
  );
}

function colonised(
  state: SimulationState,
  { aob, nob, ammonia = 0, nitrite = 0 }: { aob: number; nob: number; ammonia?: number; nitrite?: number }
): SimulationState {
  const ceiling = state.resources.surface * perCm2;
  return produce(state, (draft) => {
    draft.resources.aob = aob * ceiling;
    draft.resources.nob = nob * ceiling;
    draft.resources.ammonia = getMassFromPpm(ammonia, draft.resources.water);
    draft.resources.nitrite = getMassFromPpm(nitrite, draft.resources.water);
  });
}

function stocked(): SimulationState {
  let state = tank();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  return applyAction(state, { type: 'feed', amount: 0.5 }).state;
}

function engineNitrite(state: SimulationState): { produced: number; cleared: number } {
  const next = tick(state, config);
  const water = state.resources.water;
  const cleared =
    (next.resources.nitrate - state.resources.nitrate) / NO2_TO_NO3_MASS_RATIO / water;
  return {
    produced: (next.resources.nitrite - state.resources.nitrite) / water + cleared,
    cleared,
  };
}

function enginePeak(state: SimulationState): CycleProjection {
  let running = state;
  let ppm = 0;
  let hours = 0;
  for (let hour = 1; hour <= 24 * 180; hour++) {
    running = tick(running, config);
    const now = running.resources.nitrite / running.resources.water;
    if (now > ppm) {
      ppm = now;
      hours = hour;
    } else if (hours > 0 && now < ppm * 0.9) {
      break;
    }
  }
  return { hours, ppm };
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

describe('colonyCount', () => {
  it('reads a population in cells whatever its order of magnitude', () => {
    expect(colonyCount(0)).toBe('0');
    expect(colonyCount(0.648)).toBe('648.0 k');
    expect(colonyCount(1)).toBe('1.0 M');
    expect(colonyCount(1e3)).toBe('1.0 G');
    expect(colonyCount(1e6)).toBe('1.0 T');
  });

  it('carries a rounded figure to the next prefix instead of overflowing this one', () => {
    expect(colonyCount(999_999)).toBe('1.0 T');
    expect(colonyCount(999_900)).toBe('999.9 G');
  });
});

describe('bacteriaReadout', () => {
  it('measures each colony against its own ceiling, not the combined one', () => {
    const state = colonised(tank(), { aob: 1, nob: 0.5 });
    const readout = bacteriaReadout(state, config);

    expect(readout.aob.ceiling).toBeCloseTo(state.resources.surface * perCm2, 6);
    expect(readout.aob.pct).toBeCloseTo(100, 6);
    expect(readout.nob.pct).toBeCloseTo(50, 6);
    expect(readout.colonisation).toBeCloseTo(75, 6);
    expect(readout.surface).toBe(state.resources.surface);
  });

  it('calls a fresh tank uncycled and a seeded-cycled one cycled', () => {
    expect(bacteriaReadout(tank(), config).cycled).toBe(false);
    expect(
      bacteriaReadout(createSimulation({ tankCapacity: 200 }, { bacteria: 'cycled' }), config).cycled
    ).toBe(true);
  });

  it('withholds it while nitrite stands, however big the colonies', () => {
    const peak = colonised(tank(), { aob: 1, nob: 1, nitrite: 5 });
    expect(bacteriaReadout(peak, config).cycled).toBe(false);
  });

  it('withholds it from colonies too small to hold a feeding, and says so', () => {
    const faded = colonised(tank(), { aob: 1e-9, nob: 1e-9 });
    const readout = bacteriaReadout(faded, config);

    expect(readout.atTrace).toBe(true);
    expect(readout.cycled).toBe(false);
    expect(bacteriaSummary(readout, null)).toBe(
      `Both toxins read zero, on colonies too small to hold a feeding — ${Math.round(readout.colonisation)} % of the biofilm this tank offers.`
    );
  });

  it('reports no conversion at all on a tank with nothing in it', () => {
    const { rates } = bacteriaReadout(tank(), config);
    expect(rates.wasteToAmmonia).toBe(0);
    expect(rates.gillsToAmmonia).toBe(0);
    expect(rates.ammoniaToNitrite).toBe(0);
    expect(rates.netNitrite).toBe(0);
  });

  it('charges the ammonia the AOB take out against the nitrite they make of it', () => {
    const { rates } = bacteriaReadout(colonised(stocked(), { aob: 1, nob: 1, ammonia: 0.5 }), config);

    expect(rates.ammoniaOxidised).toBeGreaterThan(0);
    expect(rates.ammoniaToNitrite).toBeCloseTo(rates.ammoniaOxidised * NH3_TO_NO2_MASS_RATIO, 12);
    expect(rates.netNitrite).toBeCloseTo(rates.ammoniaToNitrite - rates.nitriteToNitrate, 12);
  });

  it('separates gill excretion from mineralised waste', () => {
    expect(bacteriaReadout(stocked(), config).rates.gillsToAmmonia).toBeGreaterThan(0);
  });

  it('nets nitrite the way the next tick moves it, climbing and falling', () => {
    const climbing = colonised(stocked(), { aob: 0.5, nob: 0.001, ammonia: 1 });
    const falling = colonised(stocked(), { aob: 0.001, nob: 0.5, nitrite: 1 });

    for (const state of [climbing, falling]) {
      const { rates } = bacteriaReadout(state, config);
      const engine = engineNitrite(state);
      const moved =
        (tick(state, config).resources.nitrite - state.resources.nitrite) / state.resources.water;

      expect(rates.ammoniaToNitrite).toBeCloseTo(engine.produced, 4);
      expect(rates.nitriteToNitrate).toBeCloseTo(engine.cleared, 4);
      expect(rates.netNitrite).toBeCloseTo(moved, 4);
    }
    expect(bacteriaReadout(climbing, config).rates.netNitrite).toBeGreaterThan(0);
    expect(bacteriaReadout(falling, config).rates.netNitrite).toBeLessThan(0);
  });
});

describe('projectNitritePeak', () => {
  it('finds the peak the engine reaches on a fishless soil tank, reading at most a percent high', () => {
    const state = soilTank();
    const projection = projectNitritePeak(state, config)!;
    const engine = enginePeak(state);

    expect(Math.abs(projection.hours - engine.hours)).toBeLessThanOrEqual(2);
    expect(projection.ppm).toBeGreaterThanOrEqual(engine.ppm);
    expect((projection.ppm - engine.ppm) / engine.ppm).toBeLessThan(0.01);
  });

  it('finds a lower peak once an ATO is holding the volume up', () => {
    expect(projectNitritePeak(soilTank({ ato: true }), config)!.ppm).toBeLessThan(
      projectNitritePeak(soilTank(), config)!.ppm
    );
  });

  it('gives up rather than guessing when nothing is driving the cycle', () => {
    expect(projectNitritePeak(tank(), config, 24)).toBeNull();
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
  it('explains an uncycled tank by the colony it is still waiting to grow', () => {
    const state = tank();
    const summary = bacteriaSummary(
      bacteriaReadout(state, config),
      projectNitritePeak(state, config, 24)
    );
    expect(summary).toContain('Uncycled');
    expect(summary).toContain('No nitrite peak within');
  });

  it('blames the lagging colony while nitrite is climbing', () => {
    const readout = bacteriaReadout(colonised(stocked(), { aob: 0.5, nob: 0.001, ammonia: 1 }), config);
    const summary = bacteriaSummary(readout, { hours: 30, ppm: 2 });

    expect(summary).toContain('NOB trail AOB by');
    expect(summary).toContain('Nitrite peaks in');
  });

  it('calls out the surface as the limit once both colonies have filled it', () => {
    const readout = bacteriaReadout(colonised(stocked(), { aob: 0.95, nob: 0.9, ammonia: 1 }), config);
    expect(bacteriaSummary(readout, null)).toContain('more load has nowhere to go');
  });

  it('reads a colony below its ceiling as room left rather than as a shortfall', () => {
    const summary = bacteriaSummary(
      bacteriaReadout(colonised(tank(), { aob: 0.5, nob: 0.5 }), config),
      null
    );
    expect(summary).toContain('clearing nitrite');
    expect(summary).toContain('50 % of the biofilm this tank offers');
  });
});
