import { describe, it, expect } from 'vitest';
import { PLANT_SPECIES_DATA } from '../../simulation/index.js';
import {
  hardscapeRows,
  lightTier,
  substrateConsequence,
} from './scape';

describe('lightTier', () => {
  it('reads the tier off where the species’ own tolerable band opens', () => {
    const tiers = Object.keys(PLANT_SPECIES_DATA).map((species) => [
      species,
      lightTier(species as keyof typeof PLANT_SPECIES_DATA),
    ]);
    for (const [species, tier] of tiers) {
      const [wants] = PLANT_SPECIES_DATA[species as keyof typeof PLANT_SPECIES_DATA].tolerableLight;
      expect(tier).toBe(wants < 15 ? 'low' : wants < 25 ? 'medium' : 'high');
    }
  });
});

describe('substrateConsequence', () => {
  it('describes what each substrate can root', () => {
    expect(substrateConsequence('none')).toMatch(/epiphytes only/);
    expect(substrateConsequence('gravel')).toMatch(/epiphytes only/);
    expect(substrateConsequence('sand')).toMatch(/sand/);
    expect(substrateConsequence('aqua_soil')).toMatch(/every plant/);
  });
});

describe('hardscape', () => {
  const items = [
    { id: '1', type: 'neutral_rock' as const },
    { id: '2', type: 'driftwood' as const },
    { id: '3', type: 'driftwood' as const },
  ];

  it('gives each piece the engine’s surface and pH effect', () => {
    expect(hardscapeRows(items)).toEqual([
      { id: '1', name: 'Neutral Rock', surface: 400, effect: null },
      { id: '2', name: 'Driftwood', surface: 650, effect: 'Lowers pH' },
      { id: '3', name: 'Driftwood', surface: 650, effect: 'Lowers pH' },
    ]);
  });
});
