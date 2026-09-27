import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processBreeding } from './breeding.js';
import { processLivestock } from './index.js';
import { createSimulation, type SimulationState, type Fish, type Clutch } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import type { LogEntry } from '../core/logging.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { eggsLaid, fishSize, frySize } from '../systems/fish-growth.js';

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

function withTank(fish: Fish[], clutches: Clutch[] = [], atTick = 1000): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.fish = fish;
    draft.clutches = clutches;
    draft.tick = atTick;
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

    expect(born(short, processBreeding(withTank(short), DEFAULT_CONFIG).state.fish)).toHaveLength(0);
    expect(born(full, processBreeding(withTank(full), DEFAULT_CONFIG).state.fish).length).toBeGreaterThan(0);
  });

  it('broods before growth draws the bank down', () => {
    const nearlyGrown = [
      mkFish({ sex: 'female', surplus: CAP, mass: 0.9 }),
      mkFish({ sex: 'male', surplus: CAP }),
    ];
    const out = processBreeding(withTank(nearlyGrown), DEFAULT_CONFIG);
    expect(born(nearlyGrown, out.state.fish).length).toBeGreaterThan(0);
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
      events(processBreeding(withTank(fish), DEFAULT_CONFIG).state, 'fish-spawned').map((log) => log.count!);

    const forward = broods([big, small, male]);
    const eggs = [big, small].map((f) => Math.floor(eggsLaid(f, DEFAULT_CONFIG.livestock)));

    expect(broods([small, big, male]).reverse()).toEqual(forward);
    forward.forEach((n, i) => expect(n).toBeLessThanOrEqual(eggs[i]));
  });

  it('a livebearer drops fry at fry size, and no clutch', () => {
    const pair = [mkFish({ sex: 'female', surplus: CAP }), mkFish({ sex: 'male', surplus: CAP })];
    const out = processBreeding(withTank(pair), DEFAULT_CONFIG);
    const fry = born(pair, out.state.fish);

    expect(out.state.clutches).toHaveLength(0);
    expect(fry.length).toBeGreaterThan(0);
    for (const f of fry) {
      expect(fishSize(f)).toBeCloseTo(frySize('guppy'), 10);
      expect(f.age).toBe(0);
    }
    expect(events(out.state, 'fish-spawned')[0].count).toBe(fry.length);
  });

  const eggModes: FishSpecies[] = ['neon_tetra', 'betta', 'angelfish', 'corydoras'];
  for (const species of eggModes) {
    it(`${species} lays a clutch the size of its brood`, () => {
      const female = mkFish({ species, sex: 'female', surplus: CAP });
      const pair = [female, mkFish({ species, sex: 'male', surplus: CAP })];
      const out = processBreeding(withTank(pair), DEFAULT_CONFIG);

      expect(born(pair, out.state.fish)).toHaveLength(0);
      expect(out.state.clutches).toHaveLength(1);
      expect(out.state.clutches[0].eggCount).toBeLessThanOrEqual(eggsLaid(female, DEFAULT_CONFIG.livestock));
      expect(out.state.clutches[0].laidTick).toBe(1000);
      expect(events(out.state, 'eggs-laid')).toHaveLength(1);
    });
  }

  it('hatches a clutch at exactly laidTick + hatchTime, not before', () => {
    const { hatchTime } = FISH_SPECIES_DATA.neon_tetra.breeding;
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggCount: 12, laidTick: 100 };

    const before = processBreeding(withTank([], [clutch], 100 + hatchTime - 1), DEFAULT_CONFIG);
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.fish).toHaveLength(0);

    const at = processBreeding(withTank([], [clutch], 100 + hatchTime), DEFAULT_CONFIG);
    expect(at.state.clutches).toHaveLength(0);
    expect(at.state.fish).toHaveLength(12);
    expect(events(at.state, 'eggs-hatched')).toHaveLength(1);
  });

  it('hatches fry at fry size and about half of each sex', () => {
    const clutch: Clutch = { id: 'c', species: 'guppy', eggCount: 3000, laidTick: 0 };
    const hatched = processBreeding(withTank([], [clutch], 0), DEFAULT_CONFIG).state.fish;

    expect(hatched).toHaveLength(3000);
    for (const f of hatched.slice(0, 50)) {
      expect(fishSize(f)).toBeCloseTo(frySize('guppy'), 10);
      expect(f.health).toBeGreaterThanOrEqual(95);
    }
    const males = hatched.filter((f) => f.sex === 'male').length / hatched.length;
    expect(males).toBeGreaterThan(0.45);
    expect(males).toBeLessThan(0.55);
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
