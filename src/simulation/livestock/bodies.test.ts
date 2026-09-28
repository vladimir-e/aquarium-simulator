import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processBodies } from './bodies.js';
import { processLivestock } from './index.js';
import { createSimulation, type SimulationState, type Fish, type Clutch } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import type { LogEntry } from '../core/logging.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { assimilated, metabolicFactorOf } from '../systems/metabolism.js';
import { arrivalGut } from '../systems/digestion.js';
import { bodyOrganics, eggOrganics, eggsLaid, growFish } from '../systems/fish-growth.js';
import { N_TO_NH3_MASS_RATIO } from '../core/chemistry.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';

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

/** An hour of breeding after the fish digested `digested` grams each, none when not named. */
const breed = (
  state: SimulationState,
  config: TunableConfig,
  digested: readonly number[] = state.fish.map(() => 0)
): ReturnType<typeof processBodies> =>
  processBodies(state, config, {
    updatedFish: state.fish,
    digested: [...digested],
    metabolicFactor: metabolicFactorOf(state.resources, config.livestock),
  });

const yolk = (species: FishSpecies): number =>
  arrivalGut(FISH_SPECIES_DATA[species].breeding.eggMass, DEFAULT_CONFIG.livestock);
const egg = (species: FishSpecies): number => eggOrganics(species, DEFAULT_CONFIG.livestock);
const MG_NH3_PER_G_N = N_TO_NH3_MASS_RATIO * 1000;

const born = (before: Fish[], after: Fish[]): Fish[] => after.slice(before.length);
const events = (s: SimulationState, e: string): LogEntry[] => s.logs.filter((l) => l.event === e);

describe('processBodies', () => {
  it('no-ops an empty tank', () => {
    const out = breed(withTank([]), DEFAULT_CONFIG);
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

    expect(breed(withTank(short), DEFAULT_CONFIG).state.clutches).toHaveLength(0);
    expect(breed(withTank(full), DEFAULT_CONFIG).state.clutches).toHaveLength(1);
  });

  it('broods before growth draws the bank down', () => {
    const nearlyGrown = [
      mkFish({ sex: 'female', surplus: CAP, mass: 0.9 }),
      mkFish({ sex: 'male', surplus: CAP }),
    ];
    const out = breed(withTank(nearlyGrown), DEFAULT_CONFIG);
    expect(out.state.clutches).toHaveLength(1);
  });

  it('a lone female spends her brood share and bears nothing', () => {
    const she = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const out = breed(withTank([she]), DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(1);
    expect(out.state.fish[0].surplus).toBeLessThan(CAP);
  });

  it('fathers the females of a tick together, whoever was stocked first', () => {
    const big = mkFish({ id: 'big', sex: 'female', surplus: CAP });
    const small = mkFish({ id: 'small', sex: 'female', surplus: CAP, mass: FISH_SPECIES_DATA.guppy.adultMass / 2 });
    const male = mkFish({ id: 'male', sex: 'male', surplus: 10, mass: FISH_SPECIES_DATA.guppy.adultMass / 2 });
    const broods = (fish: Fish[]): number[] =>
      events(breed(withTank(fish), DEFAULT_CONFIG).state, 'eggs-laid').map((log) => log.count!);

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
      const out = breed(withTank(pair), DEFAULT_CONFIG);

      expect(born(pair, out.state.fish)).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(1);
      expect(out.state.clutches[0].eggs).toBeLessThanOrEqual(eggsLaid(female, DEFAULT_CONFIG.livestock));
      expect(out.state.clutches[0].development).toBe(0);
      expect(events(out.state, 'eggs-laid')[0].count).toBe(out.state.clutches[0].eggs);
    });
  }

  it('hatches a clutch when its development completes, not before', () => {
    const clutch = (development: number): Clutch => ({ id: 'c', species: 'neon_tetra', eggs: 12, development });

    const before = breed(withTank([], [clutch(0.5)]), DEFAULT_CONFIG);
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.clutches[0].development).toBeGreaterThan(0.5);
    expect(before.state.fish).toHaveLength(0);

    const at = breed(withTank([], [clutch(0.9999)]), DEFAULT_CONFIG);
    expect(at.state.clutches).toHaveLength(0);
    expect(at.state.fish).toHaveLength(12);
    expect(events(at.state, 'eggs-hatched')[0].count).toBe(12);
  });

  it('a livebearer gives birth to its carried clutch', () => {
    const mother = mkFish({ id: 'mother' });
    const brood: Clutch = { id: 'c', species: 'guppy', eggs: 8, development: 0.9999, motherId: 'mother' };
    const out = breed(withTank([mother], [brood]), DEFAULT_CONFIG);
    expect(born([mother], out.state.fish)).toHaveLength(8);
    expect(events(out.state, 'fry-born')[0].count).toBe(8);
  });

  it('a livebearer carries her brood, and an egg-layer leaves hers', () => {
    for (const species of ['guppy', 'neon_tetra'] as const) {
      const she = mkFish({ id: `she-${species}`, species, sex: 'female', surplus: CAP });
      const pair = [she, mkFish({ species, sex: 'male', surplus: CAP })];
      const [clutch] = breed(withTank(pair), DEFAULT_CONFIG).state.clutches;
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
    expect(deathWaste(dying([brood])) - deathWaste(dying([]))).toBeCloseTo(12 * egg('guppy'), 12);
    const second: Clutch = { ...brood, id: 'd', eggs: 5 };
    expect(deathWaste(dying([brood, second])) - deathWaste(dying([]))).toBeCloseTo(17 * egg('guppy'), 12);
  });

  it('thins a carried brood by its mother’s own hardiness, a hardier mother keeping more', () => {
    const left = (hardinessOffset: number): number => {
      const mother = mkFish({ id: 'mother', hardinessOffset });
      const brood: Clutch = { id: 'c', species: 'guppy', eggs: 100, development: 0, motherId: 'mother' };
      const state = produce(withTank([mother], [brood]), (draft) => {
        draft.resources.nitrite = 20 * draft.resources.water;
      });
      return breed(state, DEFAULT_CONFIG).state.clutches[0].eggs;
    };
    expect(left(0)).toBeLessThan(100);
    expect(left(0.1)).toBeGreaterThan(left(0));
    expect(left(-0.1)).toBeLessThan(left(0));
  });

  it('a gestating female broods again only once she has given birth', () => {
    const she = mkFish({ id: 'she', sex: 'female', surplus: CAP });
    const pair = [she, mkFish({ sex: 'male', surplus: CAP })];
    const carrying: Clutch = { id: 'c', species: 'guppy', eggs: 5, development: 0.1, motherId: 'she' };
    const out = breed(withTank(pair, [carrying]), DEFAULT_CONFIG);
    expect(out.state.clutches.map((c) => c.id)).toEqual(['c']);
    expect(events(out.state, 'eggs-laid')).toHaveLength(0);
  });

  it('hatches each whole egg into a fry of its body and yolk, the part egg to waste', () => {
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 7.6, development: 0.9999 };
    const out = breed(withTank([], [clutch]), DEFAULT_CONFIG);
    expect(out.state.fish).toHaveLength(7);
    for (const fry of out.state.fish) {
      expect(fry.gut).toBeCloseTo(yolk('neon_tetra'), 15);
      expect(fry.mass).toBe(FISH_SPECIES_DATA.neon_tetra.breeding.eggMass);
      expect(bodyOrganics(fry.mass, DEFAULT_CONFIG.livestock) + fry.gut).toBeCloseTo(egg('neon_tetra'), 15);
    }
    const waste = out.effects.find((e) => e.resource === 'waste')!.delta;
    expect(waste).toBeCloseTo(0.6 * egg('neon_tetra'), 15);
  });

  it('hatches fry at their egg’s weight and about half of each sex', () => {
    const clutch: Clutch = { id: 'c', species: 'guppy', eggs: 3000, development: 0.9999 };
    const hatched = breed(withTank([], [clutch]), DEFAULT_CONFIG).state.fish;

    expect(hatched).toHaveLength(3000);
    for (const f of hatched.slice(0, 50)) {
      expect(f.mass).toBe(FISH_SPECIES_DATA.guppy.breeding.eggMass);
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
    const out = breed(withTank(adults, [clutch]), DEFAULT_CONFIG);

    const hatched = born(adults, out.state.fish);
    const fed = out.state.fish.slice(0, adults.length).reduce((sum, f, i) => sum + f.gut - adults[i].gut, 0);
    const waste = out.effects.reduce((sum, e) => sum + e.delta, 0);
    expect(hatched.length).toBeLessThan(40);
    expect(hatched.length).toBeGreaterThan(0);
    expect(fed + waste + hatched.length * egg('neon_tetra')).toBeCloseTo(clutch.eggs * egg('neon_tetra'), 12);
    for (const fry of hatched) expect(fry.gut).toBeCloseTo(yolk('neon_tetra'), 15);
  });

  it('feeds eaten eggs to a gut only as far as it has room, the rest to waste', () => {
    const full = mkFish({ id: 'full', species: 'angelfish', sex: 'male' });
    const stuffed = { ...full, gut: full.mass * DEFAULT_CONFIG.livestock.gutCapacity };
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = breed(withTank([stuffed], [clutch]), DEFAULT_CONFIG);

    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * egg('neon_tetra');
    expect(eaten).toBeGreaterThan(0);
    expect(out.state.fish[0].gut).toBe(stuffed.gut);
    expect(out.effects.reduce((sum, e) => sum + e.delta, 0)).toBeCloseTo(eaten, 12);
  });

  it('feeds the eggs the fish eat to their guts by the grams they outweigh an egg, and nothing is lost on the way', () => {
    const big = mkFish({ id: 'big', species: 'angelfish', sex: 'male' });
    const small = mkFish({ id: 'small', species: 'neon_tetra', sex: 'male' });
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = breed(withTank([big, small], [clutch]), DEFAULT_CONFIG);

    const [bigAfter, smallAfter] = out.state.fish;
    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * egg('neon_tetra');
    const waste = out.effects.reduce((sum, e) => sum + e.delta, 0);
    expect(bigAfter.gut + smallAfter.gut + waste).toBeCloseTo(eaten, 12);
    const { eggMass } = FISH_SPECIES_DATA.neon_tetra.breeding;
    expect(bigAfter.gut / smallAfter.gut).toBeCloseTo((big.mass - eggMass) / (small.mass - eggMass), 8);
  });

  it('shares the eggs of every clutch in the hour alike, whichever clutch comes first', () => {
    const small = mkFish({ id: 'small', species: 'neon_tetra', sex: 'male' });
    const fish = [
      mkFish({ id: 'big', species: 'angelfish', sex: 'male', gut: 0.0123 }),
      { ...small, gut: small.mass * DEFAULT_CONFIG.livestock.gutCapacity - 1e-6 },
    ];
    const neon: Clutch = { id: 'n', species: 'neon_tetra', eggs: 400, development: 0 };
    const cory: Clutch = { id: 'c', species: 'corydoras', eggs: 200, development: 0 };
    const waste = (out: ReturnType<typeof processBodies>): number => out.effects.reduce((sum, e) => sum + e.delta, 0);

    const one = breed(withTank(fish, [neon, cory]), DEFAULT_CONFIG);
    const other = breed(withTank(fish, [cory, neon]), DEFAULT_CONFIG);

    expect(one.state.fish[0].gut).toBeGreaterThan(fish[0].gut);
    expect(one.state.fish[1].gut).toBeCloseTo(small.mass * DEFAULT_CONFIG.livestock.gutCapacity, 15);
    expect(other.state.fish.map((f) => f.gut)).toEqual(one.state.fish.map((f) => f.gut));
    expect(waste(other)).toBeCloseTo(waste(one), 15);
  });

  it('grows every fish on its bank out of what it digested, and nothing out of nothing', () => {
    const fry = mkFish({ mass: 0.1, surplus: 20 });
    const fed = breed(withTank([fry]), DEFAULT_CONFIG, [0.001]);
    expect(fed.state.fish[0].mass).toBeGreaterThan(fry.mass);
    expect(fed.state.fish[0].surplus).toBeLessThan(fry.surplus);

    const unfed = breed(withTank([fry]), DEFAULT_CONFIG);
    expect(unfed.state.fish[0]).toEqual(fry);
  });

  it('excretes through the gills what the hour digested less what growth built, the feces whole', () => {
    const config = DEFAULT_CONFIG.livestock;
    const minerals = DEFAULT_CONFIG.nutrients.foodMineralContent;
    const fry = mkFish({ id: 'fry', mass: 0.1, surplus: 20 });
    const adult = mkFish({ id: 'adult', surplus: 20 });
    const digested = [0.0005, 0.002];
    const out = breed(withTank([fry, adult]), DEFAULT_CONFIG, digested);
    const retained = growFish(fry, assimilated(digested[0], config), config).retained;
    const effect = (resource: string, source: string): number =>
      out.effects.filter((e) => e.resource === resource && e.source === source).reduce((sum, e) => sum + e.delta, 0);
    const passed = assimilated(0.0025, config) - retained;

    expect(retained).toBeGreaterThan(0);
    expect(out.excreted.waste).toBeCloseTo(0.0025 * (1 - config.assimilatedFraction), 15);
    expect(effect('waste', 'fish-metabolism')).toBe(out.excreted.waste);
    expect(effect('ammonia', 'fish-gill-excretion')).toBeCloseTo(passed * config.foodNitrogenFraction * MG_NH3_PER_G_N, 12);
    for (const n of WASTE_NUTRIENTS) expect(effect(n, 'fish-gill-excretion')).toBeCloseTo(passed * minerals[n], 12);
  });

  it('excretes the hour’s digestion of a fish that died in it', () => {
    const state = withTank([]);
    const out = processBodies(state, DEFAULT_CONFIG, {
      updatedFish: [mkFish({ id: 'gone' })],
      digested: [0.001],
      metabolicFactor: 1,
    });
    expect(out.excreted.waste + assimilated(0.001, DEFAULT_CONFIG.livestock)).toBeCloseTo(0.001, 15);
    expect(out.excreted.ammonia).toBeGreaterThan(0);
  });

  it('makes a brood of its mother’s body: she loses exactly the organic matter her clutch holds', () => {
    const config = DEFAULT_CONFIG.livestock;
    for (const species of ['guppy', 'neon_tetra'] as const) {
      const she = mkFish({ id: `she-${species}`, species, sex: 'female', surplus: CAP });
      const out = breed(withTank([she, mkFish({ species, sex: 'male', surplus: CAP })]), DEFAULT_CONFIG);
      const [clutch] = out.state.clutches;
      const lost = bodyOrganics(she.mass - out.state.fish[0].mass, config);
      expect(lost).toBeCloseTo(clutch.eggs * egg(species), 12);
    }
  });

  it('never broods at a surplus cap of 0', () => {
    const zeroCap = produce(DEFAULT_CONFIG, (d) => {
      d.livestock.surplusCap = 0;
    });
    let state = withTank([mkFish({ sex: 'female' }), mkFish({ sex: 'male' })]);
    for (let t = 0; t < 24; t++) state = breed(state, zeroCap).state;

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
