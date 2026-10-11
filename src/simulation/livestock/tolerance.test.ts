import { describe, it, expect } from 'vitest';
import {
  FREE_AMMONIA_EDGE,
  HARDY_TOLERANCE,
  NITRATE_EDGE,
  NITRITE_EDGE,
  toleranceFactor,
  toxinEdges,
  toxinEFolds,
} from './tolerance.js';
import { mapToxins, TOXINS, ZERO_TOXINS } from '../config/livestock.js';

describe('toleranceFactor', () => {
  it('runs from the edge itself at hardiness 0 to the hardy span at 1', () => {
    expect(toleranceFactor(0)).toBe(1);
    expect(toleranceFactor(1)).toBe(HARDY_TOLERANCE);
    expect(toleranceFactor(0.8)).toBeGreaterThan(toleranceFactor(0.5));
  });
});

describe('toxinEFolds', () => {
  const edges = toxinEdges(0.6);

  it('carries each toxin’s edge out by the tolerance its hardiness gives', () => {
    const tolerance = toleranceFactor(0.6);
    expect(edges.ammonia).toBeCloseTo(FREE_AMMONIA_EDGE * tolerance, 15);
    expect(edges.nitrite).toBeCloseTo(NITRITE_EDGE * tolerance, 15);
    expect(edges.nitrate).toBeCloseTo(NITRATE_EDGE * tolerance, 15);
  });

  it('counts each level’s e-folds past its own edge, none at or under it', () => {
    const folds = toxinEFolds(mapToxins((t) => edges[t] * Math.E ** 2), 0.6);
    for (const t of TOXINS) expect(folds[t]).toBeCloseTo(2, 12);
    expect(toxinEFolds(edges, 0.6)).toEqual(ZERO_TOXINS);
    expect(toxinEFolds(mapToxins((t) => edges[t] / 2), 0.6)).toEqual(ZERO_TOXINS);
  });

  it('gives a hardier organism fewer e-folds of the same water', () => {
    const levels = mapToxins((t) => edges[t] * 10);
    const soft = toxinEFolds(levels, 0.3);
    const hardy = toxinEFolds(levels, 0.9);
    for (const t of TOXINS) expect(hardy[t]).toBeLessThan(soft[t]);
  });
});
