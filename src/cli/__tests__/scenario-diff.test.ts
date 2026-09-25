import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { scenariosCommand } from '../scenarios/command.js';
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

  it('reports sample days the baseline never reached', () => {
    const after: Snapshot = { nano: { no3: { d90: [10, 'G'], d300: [12, 'G'] } } };
    expect(renderDiff(snapshot('nano', 10), after)).toBe('nano\n  d300: not in the baseline');
  });
});

describe('--diff against the file --json overwrites', () => {
  it('compares with the old baseline, then writes the new one', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'scenarios-')), 'nano.json');
    writeFileSync(file, JSON.stringify({ nano: { temp: { d1: [0, 'R'] } } }));
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      scenariosCommand(['nano', '--days=1', `--json=${file}`, `--diff=${file}`]);
      expect(stdout.mock.calls.map(([text]) => String(text)).join('')).toMatch(/^nano\n {2}temp +d1 0\.0 R → /);
    } finally {
      stdout.mockRestore();
    }
    expect((JSON.parse(readFileSync(file, 'utf8')) as Snapshot).nano!.temp!.d1).not.toEqual([0, 'R']);
  });
});
