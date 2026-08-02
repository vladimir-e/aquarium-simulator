/**
 * Parameter grid × scenario → outcome table.
 *
 * Landing a constant is a fitting problem: the honest evidence for a value is
 * the region of parameter space around it that also satisfies the anchors, not
 * one hand-tuned run that happens to pass. This runs the grid and prints the
 * table, on the same scenarios and measurements the anchors assert against
 * (`./tanks.ts`), so a derivation can be re-run rather than retold.
 */

import { produce } from 'immer';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';

export type Axes = Record<string, readonly unknown[]>;

/** One combination of axis values — a single point of the grid. */
export type Point<A extends Axes> = { [K in keyof A]: A[K][number] };

/** Every combination of the named axes, last axis varying fastest. */
export function grid<A extends Axes>(axes: A): Point<A>[] {
  return Object.entries(axes).reduce<Record<string, unknown>[]>(
    (points, [axis, values]) =>
      points.flatMap((point) => values.map((value) => ({ ...point, [axis]: value }))),
    [{}]
  ) as Point<A>[];
}

/** The shipped config with a patch applied — the parameter half of a sweep. */
export function tuned(patch: (draft: TunableConfig) => void): TunableConfig {
  return produce(DEFAULT_CONFIG, patch);
}

export type Row<A extends Axes, O> = Point<A> & O;

/** Measure every point of the grid; the outcome fields join the point's own. */
export function sweep<A extends Axes, O extends Record<string, unknown>>(
  axes: A,
  measure: (point: Point<A>) => O
): Row<A, O>[] {
  return grid(axes).map((point) => ({ ...point, ...measure(point) }));
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return Math.abs(value) < 0.001 ? value.toExponential(2) : value.toFixed(3);
  }
  return String(value);
}

/** Fixed-width rendering of a sweep, for pasting into a calibration run report. */
export function formatTable(rows: ReadonlyArray<Record<string, unknown>>): string {
  if (rows.length === 0) return '';

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = rows.map((row) => columns.map((column) => cell(row[column])));
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...body.map((cells) => cells[index]!.length))
  );
  const line = (cells: string[]): string =>
    cells.map((text, index) => text.padEnd(widths[index]!)).join('  ').trimEnd();

  return [line(columns), line(widths.map((width) => '-'.repeat(width))), ...body.map(line)].join(
    '\n'
  );
}
