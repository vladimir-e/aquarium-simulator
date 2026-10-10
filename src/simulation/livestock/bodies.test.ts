import { describe, it, expect } from 'vitest';
import { deltaOf } from '../tests/effects.js';
import { produce } from 'immer';
import { processBodies } from './bodies.js';
import { processLivestock, tankPaces } from './index.js';
import { createSimulation, type SimulationState, type Fish, type Clutch } from '../state.js';
import { debParams, FISH_SPECIES_DATA, speciesTau, type FishSpecies } from '../livestock/species.js';
import type { LogEntry } from '../core/logging.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { hourlyDraw } from '../core/kinetics.js';
import { hatchling, organics } from '../systems/deb.js';
import { eggMass, eggOrganics, fishMass, fishOrganics } from '../systems/fish-body.js';
import { gutCapacity } from '../systems/digestion.js';
import { spawnsAt } from '../systems/brood.js';
import { clutchOrganics } from '../systems/clutch.js';
import { fishRecord, holdingEggs } from '../tests/fish.js';

let idSeq = 0;
function mkFish(o: Partial<Fish> = {}): Fish {
  return fishRecord({ id: `f${idSeq++}`, species: 'guppy', sex: 'female', ...o });
}

/** A male whose buffer fathers `eggs` eggs at his species' share. */
const fathering = (male: Fish, eggs: number): Fish =>
  holdingEggs(male, eggs * FISH_SPECIES_DATA[male.species].breeding.maleShare);

function withTank(fish: Fish[], clutches: Clutch[] = []): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.fish = fish;
    draft.clutches = clutches;
  });
}

const breed = (state: SimulationState): ReturnType<typeof processBodies> => processBodies(state, DEFAULT_CONFIG);
const born = (before: Fish[], after: Fish[]): Fish[] => after.slice(before.length);
const events = (s: SimulationState, e: string): LogEntry[] => s.logs.filter((l) => l.event === e);
const egg = eggOrganics;
const wasteOf = (out: ReturnType<typeof processBodies>): number =>
  out.effects.reduce((sum, e) => (e.resource === 'waste' ? sum + e.delta.grams : sum), 0);

/** Grams of organics the fish and their clutches hold, guts included. */
const held = ({ fish, clutches }: SimulationState): number =>
  fish.reduce((sum, f) => sum + fishOrganics(f) + f.gut, 0) + clutches.reduce((sum, c) => sum + clutchOrganics(c), 0);

describe('processBodies', () => {
  it('no-ops an empty tank', () => {
    const out = breed(withTank([]));
    expect(out.state.fish).toHaveLength(0);
    expect(out.effects).toHaveLength(0);
  });

  for (const species of Object.keys(FISH_SPECIES_DATA) as FishSpecies[]) {
    it(`${species} spawns once her buffer holds her bout, and not a hair short of it`, () => {
      const bout = spawnsAt(species);
      const male = fathering(mkFish({ species, sex: 'male' }), 2 * bout);
      expect(breed(withTank([holdingEggs(mkFish({ species }), bout + 0.0001), male])).state.clutches).toHaveLength(1);
      expect(breed(withTank([holdingEggs(mkFish({ species }), bout - 0.0001), male])).state.clutches).toHaveLength(0);
    });

    it(`${species} lays every egg her buffer holds, a clutch of the eggs fathered, undeveloped`, () => {
      const bout = spawnsAt(species);
      const she = holdingEggs(mkFish({ species }), bout + 9.5);
      const out = breed(withTank([she, fathering(mkFish({ species, sex: 'male' }), bout + 3.2)]));
      const [clutch] = out.state.clutches;
      expect(clutch.eggs).toBe(bout + 3);
      expect(clutch.development).toBe(0);
      expect(out.state.fish[0].deb.broodBuffer).toBeLessThan(debParams(species).E0 / debParams(species).kappaR);
    });
  }

  it('a lone female resorbs her eggs and bears nothing, every gram drawn burned', () => {
    const she = holdingEggs(mkFish({ species: 'neon_tetra' }), spawnsAt('neon_tetra') + 0.5);
    const out = breed(withTank([she]));
    expect(out.state.clutches).toHaveLength(0);
    expect(out.state.fish[0].deb.broodBuffer).toBeLessThan(she.deb.broodBuffer);
    expect(out.burned).toBeCloseTo(she.deb.broodBuffer - out.state.fish[0].deb.broodBuffer, 15);
  });

  it('hatches a clutch when its development completes, not before', () => {
    const clutch = (development: number): Clutch => ({ id: 'c', species: 'neon_tetra', eggs: 12, development });

    const before = breed(withTank([], [clutch(0.5)]));
    expect(before.state.clutches).toHaveLength(1);
    expect(before.state.clutches[0].development).toBeGreaterThan(0.5);
    expect(before.state.fish).toHaveLength(0);

    const at = breed(withTank([], [clutch(0.9999)]));
    expect(at.state.clutches).toHaveLength(0);
    expect(at.state.fish).toHaveLength(12);
    expect(events(at.state, 'eggs-hatched')[0].count).toBe(12);
  });

  it('a livebearer gives birth to its carried clutch', () => {
    const mother = mkFish({ id: 'mother' });
    const brood: Clutch = { id: 'c', species: 'guppy', eggs: 8, development: 0.9999, motherId: 'mother' };
    const out = breed(withTank([mother], [brood]));
    expect(born([mother], out.state.fish)).toHaveLength(8);
    expect(events(out.state, 'fry-born')[0].count).toBe(8);
  });

  it('a livebearer carries her brood, and an egg-layer leaves hers', () => {
    for (const species of ['guppy', 'neon_tetra'] as const) {
      const bout = spawnsAt(species);
      const she = holdingEggs(mkFish({ id: `she-${species}`, species }), bout + 4);
      const [clutch] = breed(withTank([she, fathering(mkFish({ species, sex: 'male' }), bout)])).state.clutches;
      expect(clutch.motherId).toBe(species === 'guppy' ? she.id : undefined);
    }
  });

  it('a gestating female spawns again only once she has given birth', () => {
    const she = holdingEggs(mkFish({ id: 'she' }), 20);
    const carrying: Clutch = { id: 'c', species: 'guppy', eggs: 5, development: 0.1, motherId: 'she' };
    const out = breed(withTank([she, fathering(mkFish({ sex: 'male' }), 20)], [carrying]));
    expect(out.state.clutches.map((c) => c.id)).toEqual(['c']);
    expect(events(out.state, 'eggs-laid')).toHaveLength(0);
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
      return deltaOf(out.effects.find((e) => e.source === 'fish-death')!);
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
      return breed(state).state.clutches[0].eggs;
    };
    expect(left(0)).toBeLessThan(100);
    expect(left(0.1)).toBeGreaterThan(left(0));
    expect(left(-0.1)).toBeLessThan(left(0));
  });

  it('hatches each whole egg into a hatchling, the reserve its embryo spent burned, the part egg to waste', () => {
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 7.6, development: 0.9999 };
    const p = debParams('neon_tetra');
    const out = breed(withTank([], [clutch]));
    expect(out.state.fish).toHaveLength(7);
    for (const fry of out.state.fish) {
      expect(fry.deb).toEqual(hatchling(p));
      expect(fry.gut).toBe(0);
      expect(fry.age).toBe(0);
      expect(fry.survival).toBe(1);
    }
    expect(wasteOf(out)).toBeCloseTo(0.6 * p.E0, 15);
    expect(out.burned).toBeCloseTo(7 * (p.E0 - organics(hatchling(p), p)), 15);
    expect(out.burned).toBeGreaterThan(0);
  });

  it('hatches about half of each sex, each weighing its egg', () => {
    const clutch: Clutch = { id: 'c', species: 'guppy', eggs: 3000, development: 0.9999 };
    const hatched = breed(withTank([], [clutch])).state.fish;

    expect(hatched).toHaveLength(3000);
    for (const f of hatched.slice(0, 50)) {
      expect(fishMass(f)).toBe(eggMass('guppy'));
      expect(f.health).toBeGreaterThanOrEqual(95);
    }
    const males = hatched.filter((f) => f.sex === 'male').length / hatched.length;
    expect(males).toBeGreaterThan(0.45);
    expect(males).toBeLessThan(0.55);
  });

  it('closes its ledger: what the fish and their clutches lose is the waste and the burn', () => {
    const tanks = [
      withTank([mkFish({ id: 'a', species: 'neon_tetra', sex: 'male' })], [
        { id: 'c', species: 'neon_tetra', eggs: 40.3, development: 0.9999 },
      ]),
      withTank([holdingEggs(mkFish({ id: 'she' }), 30.7), fathering(mkFish({ id: 'he', sex: 'male' }), 11.2)]),
      withTank(
        [
          holdingEggs(mkFish({ species: 'betta' }), spawnsAt('betta') + 6),
          fathering(mkFish({ species: 'betta', sex: 'male' }), 20),
        ],
        [{ id: 'c', species: 'corydoras', eggs: 30, development: 0.2 }]
      ),
    ];
    for (const tank of tanks) {
      const out = breed(tank);
      expect(held(tank) - held(out.state)).toBeCloseTo(out.waste + out.burned, 15);
      expect(wasteOf(out)).toBeCloseTo(out.waste, 15);
    }
  });

  it('feeds eaten eggs to a gut only as far as it has room, the rest to waste', () => {
    const full = mkFish({ id: 'full', species: 'angelfish', sex: 'male' });
    const [pace] = tankPaces(withTank([full]), DEFAULT_CONFIG);
    const stuffed = { ...full, gut: gutCapacity(full, pace) };
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = breed(withTank([stuffed], [clutch]));

    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * egg('neon_tetra');
    expect(eaten).toBeGreaterThan(0);
    expect(out.state.fish[0].gut).toBe(stuffed.gut);
    expect(wasteOf(out)).toBeCloseTo(eaten, 12);
  });

  it('feeds the eggs the fish eat to their guts by the grams they outweigh an egg, and nothing is lost on the way', () => {
    const big = mkFish({ id: 'big', species: 'angelfish', sex: 'male' });
    const small = mkFish({ id: 'small', species: 'neon_tetra', sex: 'male' });
    const clutch: Clutch = { id: 'c', species: 'neon_tetra', eggs: 40, development: 0 };
    const out = breed(withTank([big, small], [clutch]));

    const [bigAfter, smallAfter] = out.state.fish;
    const eaten = (clutch.eggs - out.state.clutches[0].eggs) * egg('neon_tetra');
    expect(bigAfter.gut + smallAfter.gut + wasteOf(out)).toBeCloseTo(eaten, 12);
    const outweighs = (fish: Fish): number => fishMass(fish) - eggMass('neon_tetra');
    expect(bigAfter.gut / smallAfter.gut).toBeCloseTo(outweighs(big) / outweighs(small), 8);
  });

  it('shares the eggs of every clutch in the hour alike, whichever clutch comes first', () => {
    const fish = [mkFish({ id: 'big', species: 'angelfish', sex: 'male', gut: 0.0123 }), mkFish({ id: 'small', species: 'neon_tetra', sex: 'male' })];
    const neon: Clutch = { id: 'n', species: 'neon_tetra', eggs: 400, development: 0 };
    const cory: Clutch = { id: 'c', species: 'corydoras', eggs: 200, development: 0 };

    const one = breed(withTank(fish, [neon, cory]));
    const other = breed(withTank(fish, [cory, neon]));

    expect(one.state.fish[0].gut).toBeGreaterThan(fish[0].gut);
    expect(other.state.fish.map((f) => f.gut)).toEqual(one.state.fish.map((f) => f.gut));
    expect(wasteOf(other)).toBeCloseTo(wasteOf(one), 15);
  });

  it('turns over a share of every male’s buffer at his turnover, paced by τ, and none of a female’s', () => {
    const he = fathering(mkFish({ id: 'he', sex: 'male' }), 50);
    const she = holdingEggs(mkFish({ id: 'she' }), 0.5);
    const tank = withTank([he, she]);
    const out = breed(tank);
    const tau = speciesTau('guppy', tank.resources.temperature);
    const turned = he.deb.broodBuffer * hourlyDraw(DEFAULT_CONFIG.livestock.maleBufferTurnover * tau);
    expect(out.state.fish[0].deb.broodBuffer).toBeCloseTo(he.deb.broodBuffer - turned, 15);
    expect(out.state.fish[1].deb.broodBuffer).toBe(she.deb.broodBuffer);
    expect(out.burned).toBeCloseTo(turned, 15);
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
