import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processBreeding } from './breeding.js';
import { processLivestock } from './index.js';
import { createSimulation, FISH_SPECIES_DATA, type SimulationState, type Fish, type Clutch, type FishSpecies, type LogEntry } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { getMassFromPpm } from '../resources/helpers.js';

const CAP = DEFAULT_CONFIG.livestock.surplusCap; // 50
const guppyCost = FISH_SPECIES_DATA.guppy.breeding.costFraction * CAP; // 40
const guppyShare = FISH_SPECIES_DATA.guppy.breeding.maleShareFraction * guppyCost; // 16

let idSeq = 0;
function mkFish(o: Partial<Fish> = {}): Fish {
  return {
    id: `f${idSeq++}`,
    species: 'guppy',
    mass: FISH_SPECIES_DATA.guppy.adultMass,
    health: 100,
    age: 500000, // unambiguously past any maturityAge
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

/** All fish get a non-negative net (eligible) unless overridden. */
function nets(state: SimulationState, overrides: Record<string, number> = {}): Map<string, number> {
  const m = new Map(state.fish.map((f) => [f.id, 0] as [string, number]));
  for (const [id, v] of Object.entries(overrides)) m.set(id, v);
  return m;
}

const fry = (fish: Fish[]): Fish[] => fish.filter((f) => f.stage === 'fry');
const adults = (fish: Fish[]): Fish[] => fish.filter((f) => f.stage === 'adult');
const events = (s: SimulationState, e: string): LogEntry[] => s.logs.filter((l) => l.event === e);

describe('processBreeding — gate', () => {
  it('no-ops an empty tank', () => {
    const state = withTank([]);
    const out = processBreeding(state, DEFAULT_CONFIG, new Map());
    expect(out.state.fish).toHaveLength(0);
    expect(out.state.clutches).toHaveLength(0);
  });

  it('does not spawn without an adult male', () => {
    const state = withTank([mkFish({ sex: 'female', surplus: CAP })]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn without an adult female', () => {
    const state = withTank([mkFish({ sex: 'male', surplus: CAP })]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn when the female bank is below cost', () => {
    const female = mkFish({ sex: 'female', surplus: guppyCost - 0.01 });
    const male = mkFish({ sex: 'male', surplus: CAP });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn when the male bank is below his share', () => {
    const female = mkFish({ sex: 'female', surplus: CAP });
    const male = mkFish({ sex: 'male', surplus: guppyShare - 0.01 });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(fry(out.state.fish)).toHaveLength(0);
  });

  it('does not spawn a buffered female whose net is negative this tick', () => {
    const female = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const male = mkFish({ sex: 'male', surplus: CAP });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state, { she: -0.1 }));
    expect(fry(out.state.fish)).toHaveLength(0);
    // Bank untouched — she kept her savings.
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(CAP);
  });

  it('spawns at the exact cost / share boundary with net = 0', () => {
    const female = mkFish({ id: 'she', sex: 'female', surplus: guppyCost });
    const male = mkFish({ id: 'he', sex: 'male', surplus: guppyShare });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state, { she: 0 }));
    expect(fry(out.state.fish)).toHaveLength(FISH_SPECIES_DATA.guppy.breeding.clutchSize);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBeCloseTo(0, 10);
    expect(out.state.fish.find((f) => f.id === 'he')!.surplus).toBeCloseTo(0, 10);
  });
});

describe('processBreeding — costs', () => {
  it('debits the female by cost and the male by his share', () => {
    const female = mkFish({ id: 'she', sex: 'female', surplus: 45 });
    const male = mkFish({ id: 'he', sex: 'male', surplus: 30 });
    const state = withTank([female, male]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBeCloseTo(45 - guppyCost, 10);
    expect(out.state.fish.find((f) => f.id === 'he')!.surplus).toBeCloseTo(30 - guppyShare, 10);
  });

  it('a full male serves ~3 females then drains below his share', () => {
    // Male 50, share 16 → serves 50→34→18→2, i.e. 3 spawns; a 4th female
    // ready but unserved.
    const male = mkFish({ id: 'he', sex: 'male', surplus: CAP });
    const females = [0, 1, 2, 3].map((i) =>
      mkFish({ id: `she${i}`, sex: 'female', surplus: guppyCost })
    );
    const state = withTank([male, ...females]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));

    const served = females.filter(
      (f) => out.state.fish.find((x) => x.id === f.id)!.surplus < guppyCost - 0.001
    );
    expect(served).toHaveLength(3);
    // First three (array order) were served, the last kept her bank.
    expect(out.state.fish.find((f) => f.id === 'she3')!.surplus).toBeCloseTo(guppyCost, 10);
    expect(out.state.fish.find((f) => f.id === 'he')!.surplus).toBeCloseTo(CAP - 3 * guppyShare, 10);
    expect(fry(out.state.fish)).toHaveLength(3 * FISH_SPECIES_DATA.guppy.breeding.clutchSize);
  });

  it('spends deterministically in array order across multiple males', () => {
    const m1 = mkFish({ id: 'm1', sex: 'male', surplus: guppyShare }); // serves exactly 1
    const m2 = mkFish({ id: 'm2', sex: 'male', surplus: CAP });
    const females = [0, 1, 2].map((i) => mkFish({ id: `s${i}`, sex: 'female', surplus: guppyCost }));
    const state = withTank([m1, m2, ...females]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));

    // m1 covers the first female, then m2 covers the rest.
    expect(out.state.fish.find((f) => f.id === 'm1')!.surplus).toBeCloseTo(0, 10);
    expect(out.state.fish.find((f) => f.id === 'm2')!.surplus).toBeCloseTo(CAP - 2 * guppyShare, 10);
    expect(fry(out.state.fish)).toHaveLength(3 * FISH_SPECIES_DATA.guppy.breeding.clutchSize);
  });
});

describe('processBreeding — spawn modes', () => {
  it('livebearer adds fry directly and creates no clutch', () => {
    const state = withTank([
      mkFish({ sex: 'female', surplus: CAP }),
      mkFish({ sex: 'male', surplus: CAP }),
    ]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    expect(out.state.clutches).toHaveLength(0);
    expect(fry(out.state.fish)).toHaveLength(FISH_SPECIES_DATA.guppy.breeding.clutchSize);
    expect(events(out.state, 'fish-spawned')).toHaveLength(1);
  });

  const eggModes: FishSpecies[] = ['neon_tetra', 'betta', 'angelfish', 'corydoras'];
  for (const species of eggModes) {
    it(`${species} lays a clutch (no immediate fry)`, () => {
      const b = FISH_SPECIES_DATA[species].breeding;
      const state = withTank([
        mkFish({ species, sex: 'female', surplus: b.costFraction * CAP }),
        mkFish({ species, sex: 'male', surplus: CAP }),
      ]);
      const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
      expect(fry(out.state.fish)).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(1);
      expect(out.state.clutches[0]).toMatchObject({ species, eggCount: b.clutchSize, laidTick: 1000 });
      expect(events(out.state, 'eggs-laid')).toHaveLength(1);
    });
  }

  it('hatches a clutch at exactly laidTick + hatchTime, not before', () => {
    const b = FISH_SPECIES_DATA.neon_tetra.breeding;
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggCount: b.clutchSize, laidTick: 100 };

    const before = processBreeding(withTank([], [clutch], 100 + b.hatchTime - 1), DEFAULT_CONFIG, new Map());
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.fish).toHaveLength(0);

    const at = processBreeding(withTank([], [clutch], 100 + b.hatchTime), DEFAULT_CONFIG, new Map());
    expect(at.state.clutches).toHaveLength(0);
    expect(fry(at.state.fish)).toHaveLength(b.clutchSize);
    expect(events(at.state, 'eggs-hatched')).toHaveLength(1);
  });

  it('hatched fry are valid: fry stage, age 0, fry mass, and ~50/50 sex', () => {
    // Big synthetic clutch to sample the sex distribution.
    const clutch: Clutch = { id: 'c', species: 'guppy', eggCount: 3000, laidTick: 0 };
    const out = processBreeding(withTank([], [clutch], 0), DEFAULT_CONFIG, new Map());
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
    const out = processBreeding(withTank([stale]), DEFAULT_CONFIG, new Map());
    const grown = out.state.fish[0];
    const fryMass = b.fryMassFraction * FISH_SPECIES_DATA.guppy.adultMass;
    expect(grown.mass).toBeCloseTo(fryMass + (FISH_SPECIES_DATA.guppy.adultMass - fryMass) * 0.5, 8);
    expect(grown.stage).toBe('fry');
  });

  it('promotes a fry to adult at maturityAge', () => {
    const b = FISH_SPECIES_DATA.guppy.breeding;
    const justUnder = processBreeding(
      withTank([mkFish({ stage: 'fry', age: b.maturityAge - 1 })]),
      DEFAULT_CONFIG,
      new Map()
    );
    expect(justUnder.state.fish[0].stage).toBe('fry');

    const atMaturity = processBreeding(
      withTank([mkFish({ stage: 'fry', age: b.maturityAge })]),
      DEFAULT_CONFIG,
      new Map()
    );
    expect(atMaturity.state.fish[0].stage).toBe('adult');
    expect(atMaturity.state.fish[0].mass).toBe(FISH_SPECIES_DATA.guppy.adultMass);
  });

  it('does not let fry breed', () => {
    const femaleFry = mkFish({ id: 'she', sex: 'female', stage: 'fry', age: 0, surplus: CAP });
    const maleAdult = mkFish({ sex: 'male', surplus: CAP });
    const state = withTank([femaleFry, maleAdult]);
    const out = processBreeding(state, DEFAULT_CONFIG, nets(state));
    // The only fry present is the female; no new fry were produced.
    expect(fry(out.state.fish)).toHaveLength(1);
    expect(out.state.fish.find((f) => f.id === 'she')!.surplus).toBe(CAP);
  });
});

describe('typed log events', () => {
  it('death logs carry a fish-died discriminator', () => {
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.fish = [mkFish({ health: 1 })];
      draft.resources.ammonia = 100000; // lethal
    });
    const out = processLivestock(state, DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(0);
    expect(events(out.state, 'fish-died')).toHaveLength(1);
  });
});

// --- Integration through the real tick pipeline ---

function cycledTank(capacity: number): SimulationState {
  const s = createSimulation({ tankCapacity: capacity });
  const maxB = s.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;
  return produce(s, (d) => {
    d.resources.aob = maxB;
    d.resources.nob = maxB;
    d.resources.nitrate = getMassFromPpm(10, d.resources.water);
    d.resources.oxygen = 8;
    d.resources.ph = 7;
    d.resources.temperature = 26;
  });
}

describe('breeding through tick()', () => {
  it('a dialed guppy pair breeds and grows the population; fry participate in metabolism', () => {
    let state = cycledTank(60);
    state = applyAction(state, { type: 'addFish', species: 'guppy' }).state;
    state = applyAction(state, { type: 'addFish', species: 'guppy' }).state;
    state = produce(state, (d) => {
      d.fish[0].sex = 'male';
      d.fish[1].sex = 'female';
      d.fish.forEach((f) => {
        f.health = 100;
        f.hardinessOffset = 0;
      });
    });

    for (let t = 0; t < 24 * 5; t++) {
      state = applyAction(state, { type: 'feed', amount: 0.02 }).state;
      state = tick(state, DEFAULT_CONFIG);
    }

    expect(events(state, 'fish-spawned').length).toBeGreaterThan(0);
    expect(fry(state.fish).length).toBeGreaterThan(0);
    // Fry age with the tank (metabolism runs on them).
    expect(fry(state.fish).every((f) => f.age > 0)).toBe(true);
    // The two founders remain adults.
    expect(adults(state.fish).length).toBeGreaterThanOrEqual(2);
  });

  it('a neglected (uncycled, cold) tank never breeds', () => {
    let state = createSimulation({ tankCapacity: 60 });
    state = applyAction(state, { type: 'addFish', species: 'guppy' }).state;
    state = applyAction(state, { type: 'addFish', species: 'guppy' }).state;
    state = produce(state, (d) => {
      d.fish[0].sex = 'male';
      d.fish[1].sex = 'female';
      d.equipment.heater.enabled = false;
      d.resources.temperature = 16;
      d.environment.roomTemperature = 16;
    });

    for (let t = 0; t < 24 * 10; t++) {
      state = applyAction(state, { type: 'feed', amount: 0.05 }).state;
      state = tick(state, DEFAULT_CONFIG);
    }

    expect(events(state, 'fish-spawned')).toHaveLength(0);
    expect(events(state, 'eggs-laid')).toHaveLength(0);
    expect(fry(state.fish)).toHaveLength(0);
  });
});
