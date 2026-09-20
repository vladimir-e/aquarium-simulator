import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FISH_SPECIES_DATA, PLANT_SPECIES_DATA } from '../../../simulation/index.js';
import { GLYPH_KEYS, SpeciesGlyph, type SpeciesKey } from './SpeciesGlyph';

afterEach(cleanup);

function paths(species: SpeciesKey): number {
  const { container } = render(<SpeciesGlyph species={species} />);
  return container.querySelectorAll('path, circle').length;
}

describe('SpeciesGlyph', () => {
  it('draws every species the engine can stock, and the algae', () => {
    expect(new Set(GLYPH_KEYS)).toEqual(
      new Set([...Object.keys(FISH_SPECIES_DATA), ...Object.keys(PLANT_SPECIES_DATA), 'algae'])
    );
  });

  it('gives each of them a silhouette of its own', () => {
    for (const species of GLYPH_KEYS) {
      expect(paths(species)).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('is drawn, never filled — a silhouette is a line', () => {
    const { container } = render(<SpeciesGlyph species="betta" />);
    const svg = container.querySelector('svg')!;

    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('falls back to an outline rather than an empty cell', () => {
    expect(paths('shrimp' as SpeciesKey)).toBe(1);
  });
});
