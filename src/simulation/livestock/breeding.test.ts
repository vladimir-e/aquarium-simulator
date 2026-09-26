import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processBreeding } from './breeding.js';
import { processLivestock } from './index.js';
import {
  createSimulation,
  type SimulationState,
  type Fish,
  type Clutch,
} from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import type { LogEntry } from '../core/logging.js';
import { DEFAULT_CONFIG } from '../config/index.js';

const CAP = DEFAULT_CONFIG.livestock.surplusCap;

let idSeq = 0;
function mkFish(o: Partial<Fish> = {}): Fish {
  return {
    id: `f${idSeq++}`,
    species: 'guppy',
    mass: FISH_SPECIES_DATA.guppy.adultMass,
    health: 100,
    age: 500000,
    satiation: 80,
    sex: 'female',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...o,
  };
}

function withTank(fish: Fish[], clutches: Clutch[] = [], atTick = 1000): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.fish = fish;
    draft.clutches = clutches;
    draft.tick = atTick;
  });
}

const fry = (fish: Fish[]): Fish[] => fish.filter((f) => f.stage === 'fry');
const adults = (fish: Fish[]): Fish[] => fish.filter((f) => f.stage === 'adult');
const events = (s: SimulationState, e: string): LogEntry[] => s.logs.filter((l) => l.event === e);

describe('processBreeding — gate', () => {
  it('no-ops an empty tank', () => {
    const state = withTank([]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(0);
    expect(out.state.clutches).toHaveLength(0);
  });

  it('does not spawn without an adult male', () => {
    const state = withTank([mkFish({ sex: 'female', surplus: CAP })]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn without an adult female', () => {
    const state = withTank([mkFish({ sex: 'male', surplus: CAP })]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn a funded pair still short of maturityAge', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const female = mkFish({ id: 'she', sex: 'female', age: b.maturityAge - 1, surplus: CAP });
    const male = mkFish({ sex: 'male', age: b.maturityAge - 1, surplus: CAP });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG);

    expect(fry(out.state.fish)).toHaveLength(0);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(CAP);
  });

  it('spawns once the pair is exactly maturityAge old', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const state = withTank([
      mkFish({ sex: 'female', age: b.maturityAge, surplus: CAP }),
      mkFish({ sex: 'male', age: b.maturityAge, surplus: CAP }),
    ]);
    const out = processBreeding(state, DEFAULT_CONFIG);

    expect(fry(out.state.fish)).toHaveLength(b.clutchSize);
  });

  it('needs the male grown too, not only the female', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const female = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const male = mkFish({ sex: 'male', age: b.maturityAge - 1, surplus: CAP });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG);

    expect(fry(out.state.fish)).toHaveLength(0);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(CAP);
  });

  it('spawns on a full bank and not a hair short of it', () => {
    const pair = (surplus: number): SimulationState =>
      withTank([mkFish({ id: 'she', sex: 'female', surplus }), mkFish({ sex: 'male', surplus: 0 })]);

    expect(fry(processBreeding(pair(CAP - 0.01), DEFAULT_CONFIG).state.fish)).toHaveLength(0);
    expect(fry(processBreeding(pair(CAP), DEFAULT_CONFIG).state.fish)).toHaveLength(
      FISH_SPECIES_DATA.guppy.breeding.clutchSize
    );
  });

  it('empties her bank and costs the male nothing', () => {
    const state = withTank([
      mkFish({ id: 'she', sex: 'female', surplus: CAP }),
      mkFish({ id: 'he', sex: 'male', surplus: 7 }),
    ]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(0);
    expect(out.state.fish.find((f) => f.id === 'he')!.surplus).toBe(7);
  });

  it('lets one male serve every ready female', () => {
    const females = [0, 1, 2, 3].map((i) => mkFish({ id: `she${i}`, sex: 'female', surplus: CAP }));
    const state = withTank([mkFish({ sex: 'male', surplus: 0 }), ...females]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(fry(out.state.fish)).toHaveLength(4 * FISH_SPECIES_DATA.guppy.breeding.clutchSize);
  });
});

describe('processBreeding — spawn modes', () => {
  it('livebearer adds fry directly and creates no clutch', () => {
    const state = withTank([
      mkFish({ sex: 'female', surplus: CAP }),
      mkFish({ sex: 'male', surplus: CAP }),
    ]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(out.state.clutches).toHaveLength(0);
    expect(fry(out.state.fish)).toHaveLength(FISH_SPECIES_DATA.guppy.breeding.clutchSize);
    expect(events(out.state, 'fish-spawned')).toHaveLength(1);
  });

  const eggModes: FishSpecies[] = ['neon_tetra', 'betta', 'angelfish', 'corydoras'];
  for (const species of eggModes) {
    it(`${species} lays a clutch (no immediate fry)`, () => {
      const b = FISH_SPECIES_DATA[species].breeding;
      const state = withTank([
        mkFish({ species, sex: 'female', surplus: CAP }),
        mkFish({ species, sex: 'male', surplus: CAP }),
      ]);
      const out = processBreeding(state, DEFAULT_CONFIG);
      expect(fry(out.state.fish)).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(1);
      expect(out.state.clutches[0]).toMatchObject({ species, eggCount: b.clutchSize, laidTick: 1000 });
      expect(events(out.state, 'eggs-laid')).toHaveLength(1);
    });
  }

  it('hatches a clutch at exactly laidTick + hatchTime, not before', () => {
    const b = FISH_SPECIES_DATA.neon_tetra.breeding;
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggCount: b.clutchSize, laidTick: 100 };

    const before = processBreeding(withTank([], [clutch], 100 + b.hatchTime - 1), DEFAULT_CONFIG);
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.fish).toHaveLength(0);

    const at = processBreeding(withTank([], [clutch], 100 + b.hatchTime), DEFAULT_CONFIG);
    expect(at.state.clutches).toHaveLength(0);
    expect(fry(at.state.fish)).toHaveLength(b.clutchSize);
    expect(events(at.state, 'eggs-hatched')).toHaveLength(1);
  });

  it('hatched fry are valid: fry stage, age 0, fry mass, and ~50/50 sex', () => {
    const clutch: Clutch = { id: 'c', species: 'guppy', eggCount: 3000, laidTick: 0 };
    const out = processBreeding(withTank([], [clutch], 0), DEFAULT_CONFIG);
    const hatched = out.state.fish;
    expect(hatched).toHaveLength(3000);

    const fryMass = FISH_SPECIES_DATA.guppy.breeding.fryMassFraction * FISH_SPECIES_DATA.guppy.adultMass;
    for (const f of hatched.slice(0, 50)) {
      expect(f.stage).toBe('fry');
      expect(f.age).toBe(0);
      expect(f.mass).toBeCloseTo(fryMass, 10);
      expect(f.health).toBeGreaterThanOrEqual(95);
      expect(['male', 'female']).toContain(f.sex);
    }
    const males = hatched.filter((f) => f.sex === 'male').length;
    expect(males / hatched.length).toBeGreaterThan(0.45);
    expect(males / hatched.length).toBeLessThan(0.55);
  });
});

describe('processBreeding — fry lifecycle', () => {
  it('re-derives a fry mass from its age', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const stale = mkFish({ stage: 'fry', age: b.maturityAge / 2, mass: 0.0001 });
    const out = processBreeding(withTank([stale]), DEFAULT_CONFIG);
    const grown = out.state.fish[0];
    const fryMass = b.fryMassFraction * FISH_SPECIES_DATA.guppy.adultMass;
    expect(grown.mass).toBeCloseTo(fryMass + (FISH_SPECIES_DATA.guppy.adultMass - fryMass) * 0.5, 8);
    expect(grown.stage).toBe('fry');
  });

  it('promotes a fry to adult at maturityAge', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const justUnder = processBreeding(
      withTank([mkFish({ stage: 'fry', age: b.maturityAge - 1 })]),
      DEFAULT_CONFIG
    );
    expect(justUnder.state.fish[0].stage).toBe('fry');

    const atMaturity = processBreeding(
      withTank([mkFish({ stage: 'fry', age: b.maturityAge })]),
      DEFAULT_CONFIG
    );
    expect(atMaturity.state.fish[0].stage).toBe('adult');
    expect(atMaturity.state.fish[0].mass).toBe(FISH_SPECIES_DATA.guppy.adultMass);
  });

  it('breeds a fry that matures in the same pass', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const state = withTank([
      mkFish({ sex: 'female', stage: 'fry', age: b.maturityAge, surplus: CAP }),
      mkFish({ sex: 'male', stage: 'fry', age: b.maturityAge, surplus: CAP }),
    ]);
    const out = processBreeding(state, DEFAULT_CONFIG);

    expect(adults(out.state.fish)).toHaveLength(2);
    expect(fry(out.state.fish)).toHaveLength(b.clutchSize);
  });

  it('does not let fry breed', () => {
    const femaleFry = mkFish({ id: 'she', sex: 'female', stage: 'fry', age: 0, surplus: CAP });
    const maleAdult = mkFish({ sex: 'male', surplus: CAP });
    const state = withTank([femaleFry, maleAdult]);
    const out = processBreeding(state, DEFAULT_CONFIG);
    expect(fry(out.state.fish)).toHaveLength(1);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(CAP);
  });
});

describe('typed log events', () => {
  it('death logs carry a fish-died discriminator', () => {
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.fish = [mkFish({ health: 1 })];
      draft.resources.oxygen = 0;
    });
    const out = processLivestock(state, DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(0);
    expect(events(out.state, 'fish-died')).toHaveLength(1);
  });
});

describe('processBreeding — zero surplus cap', () => {
  it('never spawns when surplusCap is 0, even for a healthy funded-looking pair', () => {
    const zeroCap = produce(DEFAULT_CONFIG, (d) => {
      d.livestock.surplusCap = 0;
    });
    const female = mkFish({ sex: 'female', surplus: 0 });
    const male = mkFish({ sex: 'male', surplus: 0 });
    let state = withTank([female, male]);

    for (let t = 0; t < 24; t++) {
      state = processBreeding(state, zeroCap).state;
    }

    expect(fry(state.fish)).toHaveLength(0);
    expect(state.clutches).toHaveLength(0);
    expect(events(state, 'fish-spawned')).toHaveLength(0);
    expect(events(state, 'eggs-laid')).toHaveLength(0);
    expect(state.fish).toHaveLength(2);
  });
});
