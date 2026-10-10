import { describe, it, expect } from 'vitest';
import { brood, offspringFathered, paysTowardBrood, readyToBrood, spawnsAt } from './brood.js';
import { eggsReady, organics } from './deb.js';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import type { Fish } from '../state.js';
import { sum } from '../core/sum.js';
import { fishRecord, holdingEggs } from '../tests/fish.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

/** A grown fish whose buffer holds `eggs` eggs. */
function parent(species: FishSpecies, sex: Fish['sex'], eggs: number, id = `${sex}-${eggs}`): Fish {
  return holdingEggs(fishRecord({ id, species, sex }), eggs);
}

describe('readyToBrood', () => {
  it.each(SPECIES)('readies a %s female once her buffer holds her bout, and not an egg short of it', (species) => {
    const bout = spawnsAt(species);
    expect(readyToBrood(parent(species, 'female', bout + 0.01), [])).toBe(true);
    expect(readyToBrood(parent(species, 'female', bout - 0.01), [])).toBe(false);
  });

  it('spawns an egg-layer in her species’ clutches, a livebearer on her first whole egg', () => {
    for (const species of SPECIES) {
      const { breeding } = FISH_SPECIES_DATA[species];
      expect(spawnsAt(species)).toBe(breeding.mode === 'livebearer' ? 1 : breeding.clutchSize);
    }
  });

  it('never readies a male, nor a female carrying a brood', () => {
    expect(readyToBrood(parent('guppy', 'male', 50), [])).toBe(false);
    const mother = parent('guppy', 'female', 50, 'mother');
    expect(readyToBrood(mother, [{ motherId: 'mother' }])).toBe(false);
    expect(readyToBrood(mother, [{ motherId: 'other' }, {}])).toBe(true);
  });
});

describe('fathering', () => {
  it('fathers what his buffer pays at his species’ share of an egg’s cost', () => {
    for (const species of SPECIES) {
      const { maleShare } = FISH_SPECIES_DATA[species].breeding;
      expect(offspringFathered(parent(species, 'male', 10))).toBeCloseTo(10 / maleShare, 9);
    }
  });

  it('pays toward a brood only with a buffer to pay from', () => {
    expect(paysTowardBrood(parent('guppy', 'male', 1))).toBe(true);
    expect(paysTowardBrood(parent('guppy', 'male', 0))).toBe(false);
    expect(paysTowardBrood(parent('guppy', 'female', 1))).toBe(false);
  });
});

describe.each(SPECIES)('a %s brood', (species) => {
  const p = debParams(species);
  const cases: [Fish[], Fish[]][] = [];
  for (const fathers of [0, 0.5, 3, 40, 1e4]) {
    const females = [12.4, 7.9, 1, 30.2].map((eggs, i) => parent(species, 'female', eggs, `f${i}`));
    const males = [parent(species, 'male', fathers, 'm0'), parent(species, 'male', fathers / 3, 'm1')];
    cases.push([females, males]);
  }

  it('draws every egg each female readies, and gives her no more offspring than that', () => {
    for (const [females, males] of cases) {
      const result = brood(females, males);
      result.females.forEach((after, i) => {
        expect(eggsReady(after, p)).toBe(0);
        expect(result.offspring[i]).toBeLessThanOrEqual(eggsReady(females[i].deb, p));
      });
    }
  });

  it('lays every egg the males can father, up to all the eggs ready', () => {
    for (const [females, males] of cases) {
      const ready = sum(females.map((f) => eggsReady(f.deb, p)));
      const fathering = sum(males.map(offspringFathered));
      expect(sum(brood(females, males).offspring)).toBe(Math.floor(Math.min(ready, fathering)));
    }
  });

  it('charges the males exactly the offspring they father, at their share, the same share of each', () => {
    for (const [females, males] of cases) {
      const result = brood(females, males);
      const paid = males.map((m, i) => m.deb.broodBuffer - result.males[i].broodBuffer);
      const cost = (FISH_SPECIES_DATA[species].breeding.maleShare * p.E0) / p.kappaR;
      expect(sum(paid) / cost).toBeCloseTo(sum(result.offspring), 8);
      if (paid[1] > 0) expect(paid[0] / males[0].deb.broodBuffer).toBeCloseTo(paid[1] / males[1].deb.broodBuffer, 12);
    }
  });

  it('closes its ledger: the buffers drawn are the clutches’ organics plus what it burns', () => {
    for (const [females, males] of cases) {
      const result = brood(females, males);
      const before = sum([...females, ...males].map((f) => organics(f.deb, p)));
      const after = sum([...result.females, ...result.males].map((deb) => organics(deb, p)));
      expect(before - after).toBeCloseTo(sum(result.offspring) * p.E0 + result.burned, 12);
      expect(result.burned).toBeGreaterThanOrEqual(0);
    }
  });

  it('settles the same whichever female was stocked first', () => {
    for (const [females, males] of cases) {
      const forward = brood(females, males).offspring;
      const backward = brood([...females].reverse(), males).offspring.reverse();
      expect(backward).toEqual(forward);
    }
  });
});
