import { describe, it, expect } from 'vitest';
import {
  countFry,
  eggMass,
  eggOrganics,
  FRY_UNTIL_SIZE,
  fishLifeStage,
  fishMass,
  fishOrganics,
  fishSize,
  frySize,
} from './fish-body.js';
import { hatchling, maxStructuralLength, organics, size, wetMass } from './deb.js';
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

  it('reads as fry under half its grown length, juvenile from it until puberty, and adult from puberty at any size', () => {
    const fish = fishRecord({ species });
    const at = (sizePercent: number, maturity: number): ReturnType<typeof fishLifeStage> =>
      fishLifeStage({
        species,
        deb: { ...fish.deb, structure: ((sizePercent / 100) * maxStructuralLength(p)) ** 3, maturity },
      });
    expect(fishLifeStage({ species, deb: hatchling(p) })).toBe('fry');
    expect(at(FRY_UNTIL_SIZE - 0.1, 0.99 * p.EHp)).toBe('fry');
    expect(at(FRY_UNTIL_SIZE + 0.1, 0.99 * p.EHp)).toBe('juvenile');
    expect(at(FRY_UNTIL_SIZE - 0.1, p.EHp)).toBe('adult');
    expect(at(FRY_UNTIL_SIZE + 0.1, p.EHp)).toBe('adult');
  });
});

describe('countFry', () => {
  it('counts the fish that read as fry, not the juveniles nor the adults', () => {
    const adult = fishRecord({ species: 'guppy' });
    const juvenile = fishRecord({ species: 'angelfish' });
    const fry = { ...adult, deb: hatchling(debParams('guppy')) };
    expect([adult, juvenile, fry].map(fishLifeStage)).toEqual(['adult', 'juvenile', 'fry']);
    expect(countFry([adult, juvenile, fry, fry])).toBe(2);
    expect(countFry([])).toBe(0);
  });
});
