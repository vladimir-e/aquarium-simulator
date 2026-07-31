import { describe, it, expect } from 'vitest';
import { biofilterColonisation } from './bacteria';
import { nitrogenCycleDefaults } from '../../simulation/config/index.js';
import type { Resources } from '../../simulation/index.js';

function resources(aob: number, nob: number, surface: number): Resources {
  return { aob, nob, surface } as Resources;
}

const perCm2 = nitrogenCycleDefaults.bacteriaPerCm2;

describe('biofilterColonisation', () => {
  it('reads both colonies against their combined ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
    expect(biofilterColonisation(resources(ceiling, 0, 1000), nitrogenCycleDefaults)).toBe(50);
  });

  it('is zero on a tank with no colonisable surface', () => {
    expect(biofilterColonisation(resources(0, 0, 0), nitrogenCycleDefaults)).toBe(0);
  });

  it('clamps a colony that overshoots its ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling * 4, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
  });
});
