import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processBreeding } from './breeding.js';
import { processLivestock } from './index.js';
import { createSimulation, type SimulationState, type Fish, type Clutch } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import type { LogEntry } from '../core/logging.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { eggsLaid, fishSize, frySize, massAtSize } from '../systems/fish-growth.js';

const CAP = DEFAULT_CONFIG.livestock.surplusCap;

let idSeq = 0;
function mkFish(o: Partial<Fish> = {}): Fish {
  const species = o.species ?? 'guppy';
  return {
    id: `f${idSeq++}`,
    species,
    mass: FISH_SPECIES_DATA[species].adultMass,
    health: 100,
    age: 0,
    gut: 0,
    sex: 'female',
    hardinessOffset: 0,
    surplus: 0,
    ...o,
  };
}

function withTank(fish: Fish[], clutches: Clutch[] = []): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.fish = fish;
    draft.clutches = clutches;
  });
}

const born = (before: Fish[], after: Fish[]): Fish[] => after.slice(before.length);
const events = (s: SimulationState, e: string): LogEntry[] => s.logs.filter((l) => l.event === e);

describe('processBreeding', () => {
  it('no-ops an empty tank', () => {
    const out = processBreeding(withTank([]), DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(0);
    expect(out.state.clutches).toHaveLength(0);
  });

  it('broods on a full bank and not a hair short of it', () => {
    const pair = (surplus: number): Fish[] => [
      mkFish({ sex: 'female', surplus }),
      mkFish({ sex: 'male', surplus: CAP }),
    ];
    const short = pair(CAP - 0.01);
    const full = pair(CAP);

    expect(processBreeding(withTank(short), DEFAULT_CONFIG).state.clutches).toHaveLength(0);
    expect(processBreeding(withTank(full), DEFAULT_CONFIG).state.clutches).toHaveLength(1);
  });

  it('broods before growth draws the bank down', () => {
    const nearlyGrown = [
      mkFish({ sex: 'female', surplus: CAP, mass: 0.9 }),
      mkFish({ sex: 'male', surplus: CAP }),
    ];
    const out = processBreeding(withTank(nearlyGrown), DEFAULT_CONFIG);
    expect(out.state.clutches).toHaveLength(1);
  });

  it('a lone female spends her brood share and bears nothing', () => {
    const she = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const out = processBreeding(withTank([she]), DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(1);
    expect(out.state.fish[0].surplus).toBeLessThan(CAP);
  });

  it('fathers the females of a tick together, whoever was stocked first', () => {
    const big = mkFish({ id: 'big', sex: 'female', surplus: CAP });
    const small = mkFish({ id: 'small', sex: 'female', surplus: CAP, mass: FISH_SPECIES_DATA.guppy.adultMass / 2 });
    const male = mkFish({ id: 'male', sex: 'male', surplus: 10, mass: FISH_SPECIES_DATA.guppy.adultMass / 2 });
    const broods = (fish: Fish[]): number[] =>
      events(processBreeding(withTank(fish), DEFAULT_CONFIG).state, 'eggs-laid').map((log) => log.count!);

    const forward = broods([big, small, male]);
    const eggs = [big, small].map((f) => Math.floor(eggsLaid(f, DEFAULT_CONFIG.livestock)));

    expect(broods([small, big, male]).reverse()).toEqual(forward);
    forward.forEach((n, i) => expect(n).toBeLessThanOrEqual(eggs[i]));
  });

  const ALL: FishSpecies[] = ['guppy', 'neon_tetra', 'betta', 'angelfish', 'corydoras'];
  for (const species of ALL) {
    it(`${species} broods a clutch the size of its brood, undeveloped`, () => {
      const female = mkFish({ species, sex: 'female', surplus: CAP });
      const pair = [female, mkFish({ species, sex: 'male', surplus: CAP })];
      const out = processBreeding(withTank(pair), DEFAULT_CONFIG);

      expect(born(pair, out.state.fish)).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(1);
      expect(out.state.clutches[0].eggs).toBeLessThanOrEqual(eggsLaid(female, DEFAULT_CONFIG.livestock));
      expect(out.state.clutches[0].development).toBe(0);
      expect(events(out.state, 'eggs-laid')[0].count).toBe(out.state.clutches[0].eggs);
    });
  }

  it('hatches a clutch when its development completes, not before', () => {
    const clutch = (development: number): Clutch => ({ id: 'c', species: 'neon_tetra', eggs: 12, development });

    const before = processBreeding(withTank([], [clutch(0.5)]), DEFAULT_CONFIG);
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.clutches[0].development).toBeGreaterThan(0.5);
    expect(before.state.fish).toHaveLength(0);

    const at = processBreeding(withTank([], [clutch(0.9999)]), DEFAULT_CONFIG);
    expect(at.state.clutches).toHaveLength(0);
    expect(at.state.fish).toHaveLength(12);
    expect(events(at.state, 'eggs-hatched')[0].count).toBe(12);
  });

  it('a livebearer gives birth to its carried clutch', () => {
    const mother = mkFish({ id: 'mother' });
    const brood: Clutch = { id: 'c', species: 'guppy', eggs: 8, development: 0.9999, motherId: 'mother' };
    const out = processBreeding(withTank([mother], [brood]), DEFAULT_CONFIG);
    expect(born([mother], out.state.fish)).toHaveLength(8);
    expect(events(out.state, 'fry-born')[0].count).toBe(8);
  });

  it('a livebearer carries her brood, and an egg-layer leaves hers', () => {
    for (const species of ['guppy', 'neon_tetra'] as const) {
      const she = mkFish({ id: `she-${species}`, species, sex: 'female', surplus: CAP });
      const pair = [she, mkFish({ species, sex: 'male', surplus: CAP })];
      const [clutch] = processBreeding(withTank(pair), DEFAULT_CONFIG).state.clutches;
      expect(clutch.motherId).toBe(species === 'guppy' ? she.id : undefined);
    }
  });

  it('a carried brood dies with its mother, every egg to waste when nothing eats her', () => {
    const dying = (clutches: Clutch[]): SimulationState =>
      produce(withTank([mkFish({ id: 'mother', health: 0.01 })], clutches), (draft) => {
        draft.resources.oxygen = 0;
      });
    const brood: Clutch = { id: 'c', species: 'guppy', eggs: 12, development: 0.5, motherId: 'mother' };
    const deathWaste = (state: SimulationState): number => {
      const out = processLivestock(state, DEFAULT_CONFIG);
      expect(out.state.fish).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(0);
      return out.effects.find((e) => e.source === 'fish-death')!.delta;
    };
    expect(deathWaste(dying([brood])) - deathWaste(dying([]))).toBeCloseTo(12 * FISH_SPECIES_DATA.guppy.breeding.eggMass, 12);
    const second: Clutch = { ...brood, id: 'd', eggs: 5 };
    expect(deathWaste(dying([brood, second])) - deathWaste(dying([]))).toBeCloseTo(17 * FISH_SPECIES_DATA.guppy.breeding.eggMass, 12);
  });

  it('a gestating female broods again only once she has given birth', () => {
    const she = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const pair = [she, mkFish({ sex: 'male', surplus: CAP })];
    const carrying: Clutch = { id: 'c', species: 'guppy', eggs: 5, development: 0.1, motherId: 'she' };
    const out = processBreeding(withTank(pair, [carrying]), DEFAULT_CONFIG);
    expect(out.state.clutches.map((c) => c.id)).toEqual(['c']);
    expect(events(out.state, 'eggs-laid')).toHaveLength(0);
  });

  it('hatches the whole eggs left, the part egg to waste', () => {
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 7.6, development: 0.9999 };
    const out = processBreeding(withTank([], [clutch]), DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(7);
    const waste = out.effects.find((e) => e.resource === 'waste')!.delta;
    expect(waste).toBeCloseTo(0.6 * FISH_SPECIES_DATA.neon_tetra.breeding.eggMass, 10);
  });

  it('hatches fry at fry size and about half of each sex', () => {
    const clutch: Clutch = { id: 'c', species: 'guppy', eggs: 3000, development: 0.9999 };
    const hatched = processBreeding(withTank([], [clutch]), DEFAULT_CONFIG).state.fish;

    expect(hatched).toHaveLength(3000);
    for (const f of hatched.slice(0, 50)) {
      expect(fishSize(f)).toBeCloseTo(frySize('guppy'), 10);
      expect(f.age).toBe(0);
      expect(f.health).toBeGreaterThanOrEqual(95);
    }
    const males = hatched.filter((f) => f.sex === 'male').length / hatched.length;
    expect(males).toBeGreaterThan(0.45);
    expect(males).toBeLessThan(0.55);
  });

  it('feeds the eggs eaten in a clutch’s hatching hour to the fish that ate them, none to the hatchlings', () => {
    const adults = [mkFish({ id: 'a', species: 'angelfish', sex: 'male' }), mkFish({ id: 'b', species: 'angelfish', sex: 'male' })];
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0.9999 };
    const out = processBreeding(withTank(adults, [clutch]), DEFAULT_CONFIG);

    const hatched = born(adults, out.state.fish);
    const eggMass = FISH_SPECIES_DATA.neon_tetra.breeding.eggMass;
    const fed = out.state.fish.slice(0, adults.length).reduce((sum, f, i) => sum + f.gut - adults[i].gut, 0);
    const waste = out.effects.reduce((sum, e) => sum + e.delta, 0);
    expect(hatched.length).toBeLessThan(40);
    expect(hatched.length).toBeGreaterThan(0);
    expect(fed + waste).toBeCloseTo((clutch.eggs - hatched.length) * eggMass, 12);
    for (const fry of hatched) expect(fry.gut).toBe(massAtSize('neon_tetra', frySize('neon_tetra')) * DEFAULT_CONFIG.livestock.maintenanceRation);
  });

  it('feeds eaten eggs to a gut only as far as it has room, the rest to waste', () => {
    const full = mkFish({ id: 'full', species: 'angelfish', sex: 'male' });
    const stuffed = { ...full, gut: full.mass * DEFAULT_CONFIG.livestock.gutCapacity };
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = processBreeding(withTank([stuffed], [clutch]), DEFAULT_CONFIG);

    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * FISH_SPECIES_DATA.neon_tetra.breeding.eggMass;
    expect(eaten).toBeGreaterThan(0);
    expect(out.state.fish[0].gut).toBe(stuffed.gut);
    expect(out.effects.reduce((sum, e) => sum + e.delta, 0)).toBeCloseTo(eaten, 12);
  });

  it('feeds the eggs the fish eat to their guts by mass, and nothing is lost on the way', () => {
    const big = mkFish({ id: 'big', species: 'angelfish', sex: 'male' });
    const small = mkFish({ id: 'small', species: 'neon_tetra', sex: 'male' });
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = processBreeding(withTank([big, small], [clutch]), DEFAULT_CONFIG);

    const [bigAfter, smallAfter] = out.state.fish;
    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * FISH_SPECIES_DATA.neon_tetra.breeding.eggMass;
    const waste = out.effects.reduce((sum, e) => sum + e.delta, 0);
    expect(bigAfter.gut + smallAfter.gut + waste).toBeCloseTo(eaten, 12);
    expect(bigAfter.gut / smallAfter.gut).toBeCloseTo(big.mass / small.mass, 8);
  });

  it('grows every fish on its bank', () => {
    const fry = mkFish({ mass: 0.1, surplus: 20 });
    const out = processBreeding(withTank([fry]), DEFAULT_CONFIG);
    expect(out.state.fish[0].mass).toBeGreaterThan(fry.mass);
    expect(out.state.fish[0].surplus).toBeLessThan(fry.surplus);
  });

  it('never broods at a surplus cap of 0', () => {
    const zeroCap = produce(DEFAULT_CONFIG, (d) => {
      d.livestock.surplusCap = 0;
    });
    let state = withTank([mkFish({ sex: 'female' }), mkFish({ sex: 'male' })]);
    for (let t = 0; t < 24; t++) state = processBreeding(state, zeroCap).state;

    expect(state.fish).toHaveLength(2);
    expect(state.clutches).toHaveLength(0);
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
