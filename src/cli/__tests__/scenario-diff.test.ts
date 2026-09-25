import { describe, it, expect } from 'vitest';
import { renderDiff, type Snapshot } from '../scenarios/diff.js';

const snapshot = (label: string, no3: number | null, grade: 'G' | 'A' | 'R' | null = 'G'): Snapshot => ({
  [label]: { no3: { d90: no3 === null || grade === null ? no3 : [no3, grade] } },
});

describe('renderDiff', () => {
  it('says no change when nothing moved past display rounding and 5 %', () => {
    expect(renderDiff(snapshot('nano', 20), snapshot('nano', 20.5))).toBe('no change');
  });

  it('shows a grade change even on a small move', () => {
    expect(renderDiff(snapshot('nano', 40), snapshot('nano', 40.1, 'A'))).toContain('d90 40.0 G → 40.1 A');
  });

  it('shows a big move within a grade, under the tweaked label', () => {
    const report = renderDiff(snapshot('nano', 10), snapshot('nano --feed=1g', 20));
    expect(report).toMatch(/^nano --feed=1g\n {2}NO₃ +d90 10\.0 G → 20\.0 G$/);
  });

  it('shows a reading going blank', () => {
    expect(renderDiff(snapshot('nano', 10), snapshot('nano', null))).toContain('10.0 G → —');
  });

  it('flags a setup the baseline lacks', () => {
    expect(renderDiff(snapshot('nano', 10), snapshot('cold', 10))).toContain('not in the baseline');
  });
});
