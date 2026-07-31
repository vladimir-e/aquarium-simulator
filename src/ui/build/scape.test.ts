import { describe, it, expect } from 'vitest';
import {
  hardscapeRows,
  hardscapeSummary,
  plantOptions,
  scapeSummary,
  substrateConsequence,
} from './scape';

describe('substrateConsequence', () => {
  it('describes what each substrate can root', () => {
    expect(substrateConsequence('none')).toMatch(/epiphytes only/);
    expect(substrateConsequence('gravel')).toMatch(/epiphytes only/);
    expect(substrateConsequence('sand')).toMatch(/sand/);
    expect(substrateConsequence('aqua_soil')).toMatch(/every plant/);
  });
});

describe('plantOptions', () => {
  it('marks every species compatible on aqua soil', () => {
    expect(plantOptions('aqua_soil').every((o) => o.compatible)).toBe(true);
  });

  it('gates rooted species off an inert/bare substrate, keeping epiphytes', () => {
    const byId = Object.fromEntries(plantOptions('none').map((o) => [o.species, o.compatible]));
    expect(byId.java_fern).toBe(true); // epiphyte — attaches to hardscape
    expect(byId.anubias).toBe(true);
    expect(byId.amazon_sword).toBe(false); // needs sand+
    expect(byId.dwarf_hairgrass).toBe(false); // needs aqua soil
    expect(byId.monte_carlo).toBe(false);
  });

  it('roots sand species on sand but still gates aqua-soil species', () => {
    const byId = Object.fromEntries(plantOptions('sand').map((o) => [o.species, o.compatible]));
    expect(byId.amazon_sword).toBe(true);
    expect(byId.monte_carlo).toBe(false);
  });

  it('hints at the demand it brings, or at every substrate that would take it', () => {
    const byId = Object.fromEntries(plantOptions('gravel').map((o) => [o.species, o.hint]));
    expect(byId.java_fern).toBe('low demand');
    expect(byId.amazon_sword).toBe('needs sand or aqua soil');
    expect(byId.monte_carlo).toBe('needs aqua soil');
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

  it('collapses the summary by type with counts, behind the substrate', () => {
    expect(hardscapeSummary(items)).toBe('rock + driftwood ×2');
    expect(scapeSummary('aqua_soil', items)).toBe('Aqua Soil + rock + driftwood ×2');
    expect(scapeSummary('aqua_soil', [])).toBe('Aqua Soil');
  });
});
