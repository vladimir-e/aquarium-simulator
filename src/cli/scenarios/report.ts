import { READINGS, type Grade } from './readings.js';
import type { Cell, ScenarioResult, TraceRow } from './run.js';
import type { Setup } from './setups.js';

const ANSI: Record<Grade, string> = { G: '\x1b[32m', A: '\x1b[33m', R: '\x1b[31m' };
const RESET = '\x1b[0m';

function describe(setup: Setup): string {
  const parts = [
    `${setup.gallons} gal`,
    setup.heaterF === null ? `unheated (${setup.roomF}°F room)` : `${setup.heaterF}°F`,
    setup.filter ?? 'no filter',
    setup.light === null ? 'no light' : `${Math.round(setup.light.par)} PAR × ${setup.light.hours}h`,
    ...(setup.co2 === null ? [] : [`CO₂ ${setup.co2} bps`]),
    ...(setup.doser === null ? [] : [`doser ${setup.doser} ml/d`]),
    `${setup.plants.reduce((n, p) => n + (p.count ?? 1), 0)} plants`,
    `${setup.fish.reduce((n, f) => n + (f.count ?? 1), 0)} fish`,
    setup.cycled ? 'cycled' : 'uncycled',
  ];
  return parts.join(' · ');
}

interface Text {
  text: string;
  grade?: Grade | null;
}

function cellText(cell: Cell, digits: number, color: boolean): Text {
  if (cell.value === null) return { text: '—' };
  const text = cell.value.toFixed(digits);
  if (cell.grade === null) return { text };
  return color ? { text, grade: cell.grade } : { text: `${text} ${cell.grade}` };
}

function grid(header: string[], rows: Text[][], leftAligned: number): string {
  const cells = [header.map((text) => ({ text })), ...rows];
  const widths = header.map((_, i) => Math.max(...cells.map((row) => row[i]!.text.length)));
  const line = (row: Text[]): string =>
    row
      .map(({ text, grade }, i) => {
        const padded = i < leftAligned ? text.padEnd(widths[i]!) : text.padStart(widths[i]!);
        return grade ? `${ANSI[grade]}${padded}${RESET}` : padded;
      })
      .join('  ')
      .trimEnd();
  return cells.map(line).join('\n');
}

export function renderTable(result: ScenarioResult, { color, label }: { color: boolean; label: string }): string {
  const header = ['reading', 'unit', ...result.days.map((d) => `d${d}`)];
  const rows = READINGS.map((r) => [
    { text: r.label },
    { text: r.unit },
    ...result.cells[r.id].map((cell) => cellText(cell, r.digits, color)),
  ]);
  return [`${label} — ${result.setup.about}`, describe(result.setup), '', grid(header, rows, 2)].join('\n');
}

export function renderHourly(trace: TraceRow[], day: number): string {
  const header = ['hour', 'PAR', '°F', 'O₂', 'CO₂', 'pH'];
  const rows = trace.map((t) =>
    [
      String(t.hour).padStart(2, '0'),
      t.par.toFixed(0),
      t.tempF.toFixed(1),
      t.o2.toFixed(2),
      t.co2.toFixed(2),
      t.ph.toFixed(2),
    ].map((text) => ({ text }))
  );
  return [`hourly, day ${day}`, grid(header, rows, 1)].join('\n');
}

/** One line per reading, so a before/after diff reads reading by reading. */
export function toJson(results: { label: string; result: ScenarioResult }[]): string {
  const setups = results.map(({ label, result }) => {
    const readings = READINGS.map((r) => {
      const byDay = Object.fromEntries(
        result.days.map((d, i) => {
          const cell = result.cells[r.id][i]!;
          return [`d${d}`, cell.grade === null ? cell.value : [cell.value, cell.grade]];
        })
      );
      return `    ${JSON.stringify(r.id)}: ${JSON.stringify(byDay)}`;
    });
    return `  ${JSON.stringify(label)}: {\n${readings.join(',\n')}\n  }`;
  });
  return `{\n${setups.join(',\n')}\n}\n`;
}
