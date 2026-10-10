import { describe, it, expect } from 'vitest';
import { debParams, FISH_SPECIES_DATA, type FishSpecies } from './species.js';
import { fromAmP, LIFESPAN_SURVIVAL } from './amp.js';
import { hatchling, maxReserveDensity, maxStructuralLength, stepDeb, wetMass } from '../systems/deb.js';

const roster = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

describe.each(roster)('%s on its energy budget', (species) => {
  const { adultLength, adultMass, lifespan, deb } = FISH_SPECIES_DATA[species];
  const p = debParams(species);

  it('converts its entry once', () => {
    expect(debParams(species)).toBe(p);
    expect(p).toEqual(fromAmP(deb));
  });

  it('grows to its adult length and weight', () => {
    const structure = maxStructuralLength(p) ** 3;
    const reserve = maxReserveDensity(p) * structure;
    expect(maxStructuralLength(p) / deb.del_M).toBeCloseTo(adultLength, 9);
    expect(wetMass({ structure, reserve, maturity: p.EHp, broodBuffer: 0, wearLoad: 0, hazard: 0 }, p)).toBeCloseTo(
      adultMass,
      9
    );
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

describe('the roster shapes', () => {
  const shapes = roster.map((species) => FISH_SPECIES_DATA[species].deb.del_M);

  it('reads every body as a fish: δ_M between 0.1 and 0.3', () => {
    expect(shapes.every((delM) => delM > 0.1 && delM < 0.3)).toBe(true);
  });

  it('gives the angelfish, lightest for its length, the smallest', () => {
    expect(Math.min(...shapes)).toBe(FISH_SPECIES_DATA.angelfish.deb.del_M);
  });
});
