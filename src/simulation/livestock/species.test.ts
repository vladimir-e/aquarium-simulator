import { describe, it, expect } from 'vitest';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from './species.js';
import { fromAmP } from './amp.js';
import { maxStructuralLength, wetMass } from '../systems/deb.js';
import { arrheniusFactor } from '../core/kinetics.js';
import { expectRelative, feastFromHatching, grown, medianDeathHour, pubertyHour } from '../tests/deb.js';

const roster = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

describe.each(roster)('%s on its energy budget', (species) => {
  const { adultLength, adultMass, maturityAge, lifespan, temperatureRange, amp } = FISH_SPECIES_DATA[species];
  const p = debParams(species);

  it('runs on its converted entry', () => {
    expect(p).toEqual(fromAmP(amp));
  });

  it('grows to its adult size, breeds at its maturity age, dies around its lifespan, fed freely in mid-range water', () => {
    const [low, high] = temperatureRange;
    const life = feastFromHatching(p, 1.1 * lifespan, arrheniusFactor((low + high) / 2, p.TA));
    expectRelative(wetMass(grown(p), p), adultMass);
    expectRelative(maxStructuralLength(p) / p.delM, adultLength);
    expectRelative(pubertyHour(life, p), maturityAge, 0.02);
    expectRelative(medianDeathHour(life), lifespan, 0.02);
  });
});

describe('the roster shapes', () => {
  const shapes = roster.map((species) => debParams(species).delM);

  it('reads every body as a fish: δ_M between 0.1 and 0.3', () => {
    expect(shapes.every((delM) => delM > 0.1 && delM < 0.3)).toBe(true);
  });

  it('gives the angelfish, lightest for its length, the smallest', () => {
    expect(Math.min(...shapes)).toBe(debParams('angelfish').delM);
  });
});
