import { describe, it, expect } from 'vitest';
import { formatTable, grid, sweep, tuned } from './sweep.js';
import { DEFAULT_CONFIG } from '../config/index.js';

describe('grid', () => {
  it('has one point when there is nothing to vary', () => {
    expect(grid({})).toEqual([{}]);
  });

  it('takes the product of its axes', () => {
    expect(grid({ a: [1, 2, 3], b: ['x', 'y'] })).toHaveLength(6);
    expect(grid({ a: [1, 2], b: [1, 2], c: [1, 2] })).toHaveLength(8);
  });

  it('varies the last axis fastest, so a printed table reads in blocks', () => {
    expect(grid({ a: [1, 2], b: ['x', 'y'] })).toEqual([
      { a: 1, b: 'x' },
      { a: 1, b: 'y' },
      { a: 2, b: 'x' },
      { a: 2, b: 'y' },
    ]);
  });

  it('collapses to nothing if any axis is empty', () => {
    expect(grid({ a: [1, 2], b: [] })).toEqual([]);
  });
});

describe('tuned', () => {
  it('patches one constant and leaves the rest of the config alone', () => {
    const config = tuned((draft) => {
      draft.nitrogenCycle.bacteriaPerCm2 = 42;
    });

    expect(config.nitrogenCycle.bacteriaPerCm2).toBe(42);
    expect(config.nitrogenCycle.bacteriaProcessingRate).toBe(
      DEFAULT_CONFIG.nitrogenCycle.bacteriaProcessingRate
    );
    expect(config.decay).toEqual(DEFAULT_CONFIG.decay);
  });

  it('never mutates the shipped defaults', () => {
    const before = DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2;
    tuned((draft) => {
      draft.nitrogenCycle.bacteriaPerCm2 = 999;
    });

    expect(DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2).toBe(before);
  });
});

describe('sweep', () => {
  it('joins each point to what it measured', () => {
    const rows = sweep({ n: [1, 2, 3] }, ({ n }) => ({ square: n * n }));

    expect(rows).toEqual([
      { n: 1, square: 1 },
      { n: 2, square: 4 },
      { n: 3, square: 9 },
    ]);
  });

  it('measures every point of a multi-axis grid exactly once', () => {
    const seen: string[] = [];
    sweep({ a: [1, 2], b: ['x', 'y'] }, (point) => {
      seen.push(`${point.a}${point.b}`);
      return {};
    });

    expect(seen).toEqual(['1x', '1y', '2x', '2y']);
  });
});

describe('formatTable', () => {
  it('has nothing to render without rows', () => {
    expect(formatTable([])).toBe('');
  });

  it('pads every column to its widest cell and rules off the header', () => {
    const lines = formatTable([
      { litres: 10, verdict: 'PASS' },
      { litres: 1000, verdict: '' },
    ]).split('\n');

    expect(lines[0]).toBe('litres  verdict');
    expect(lines[1]).toBe('------  -------');
    expect(lines[2]).toBe('10      PASS');
    expect(lines[3]).toBe('1000');
  });

  it('keeps a column that only some rows carry', () => {
    const lines = formatTable([{ a: 1 }, { a: 2, b: 3 }]).split('\n');

    expect(lines[0]).toBe('a  b');
    expect(lines[2]).toBe('1  —');
    expect(lines[3]).toBe('2  3');
  });

  it('shortens the numbers so columns line up rather than overflow', () => {
    const lines = formatTable([
      { n: 21 },
      { n: 21.16666666 },
      { n: 0.00054 },
      { n: null },
    ]).split('\n');

    expect(lines.slice(2)).toEqual(['21     ', '21.167 ', '5.40e-4', '—      '].map((s) => s.trimEnd()));
  });
});
