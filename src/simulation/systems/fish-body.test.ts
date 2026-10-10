import { describe, it, expect } from 'vitest';
import { countFry, eggMass, eggOrganics, fishLifeStage, fishMass, fishOrganics, fishSize, frySize } from './fish-body.js';
import { hatchling, organics, size, wetMass } from './deb.js';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { fishRecord } from '../tests/fish.js';

const SPECIES = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

describe.each(SPECIES)('a %s body', (species) => {
  const p = debParams(species);

  it('reads its weight, size and organics off its budget', () => {
    const fish = fishRecord({ species, size: 60 });
    expect(fishMass(fish)).toBe(wetMass(fish.deb, p));
    expect(fishSize(fish)).toBe(size(fish.deb, p));
    expect(fishOrganics(fish)).toBe(organics(fish.deb, p));
  });

  it('lays an egg of E_0 that weighs what its hatchling does, and hatches at the hatchling size', () => {
    expect(eggOrganics(species)).toBe(p.E0);
    expect(eggMass(species)).toBe(wetMass(hatchling(p), p));
    expect(frySize(species)).toBe(size(hatchling(p), p));
  });

  it('reads as fry until puberty and adult from it', () => {
    const fish = fishRecord({ species });
    expect(fishLifeStage({ ...fish, deb: { ...fish.deb, maturity: p.EHp } })).toBe('adult');
    expect(fishLifeStage({ ...fish, deb: { ...fish.deb, maturity: 0.99 * p.EHp } })).toBe('fry');
    expect(fishLifeStage({ species, deb: hatchling(p) })).toBe('fry');
  });
});

describe('countFry', () => {
  it('counts the fish not yet at puberty', () => {
    const p = debParams('guppy');
    const adult = fishRecord({ species: 'guppy' });
    const fry = { ...adult, deb: hatchling(p) };
    expect(countFry([adult, fry, fry])).toBe(2);
    expect(countFry([])).toBe(0);
  });
});
