import { describe, it, expect } from 'vitest';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from './species.js';
import { fromAmP, LIFESPAN_SURVIVAL } from './amp.js';
import { hatchling, maxStructuralLength, stepDeb } from '../systems/deb.js';

const roster = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

describe.each(roster)('%s on its energy budget', (species) => {
  const { adultLength, lifespan, deb } = FISH_SPECIES_DATA[species];
  const p = debParams(species);

  it('converts its entry once', () => {
    expect(debParams(species)).toBe(p);
    expect(p).toEqual(fromAmP(deb));
  });

  it('grows to its adult length', () => {
    expect(maxStructuralLength(p) / deb.del_M).toBeCloseTo(adultLength, 9);
  });

  it('dies around its lifespan: half a cohort fed without limit at 20 °C outlives it', () => {
    let state = hatchling(p);
    let cumulativeHazard = 0;
    for (let t = 0; t < lifespan; t++) {
      state = stepDeb(state, p, { fromGut: 1, tau: 1, omega: 1 }).state;
      cumulativeHazard += state.hazard;
    }
    expect(Math.abs(Math.exp(-cumulativeHazard) - LIFESPAN_SURVIVAL)).toBeLessThan(1e-3);
  });
});
