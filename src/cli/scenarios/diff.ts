import { READINGS, type Grade } from './readings.js';

type Sample = number | null | [number, Grade];

export type Snapshot = Record<string, Record<string, Record<string, Sample>>>;

const MEANINGFUL_SHARE = 0.05;

const setupName = (label: string): string => label.split(' ')[0]!;

function split(sample: Sample | undefined): { value: number | null; grade: Grade | null } {
  if (Array.isArray(sample)) return { value: sample[0], grade: sample[1] };
  return { value: sample ?? null, grade: null };
}

function moved(before: number | null, after: number | null, digits: number): boolean {
  if (before === null || after === null) return before !== after;
  const delta = Math.abs(after - before);
  return Math.round(delta * 10 ** digits) >= 1 && delta > MEANINGFUL_SHARE * Math.abs(before);
}

function show({ value, grade }: { value: number | null; grade: Grade | null }, digits: number): string {
  if (value === null) return '—';
  return grade === null ? value.toFixed(digits) : `${value.toFixed(digits)} ${grade}`;
}

export function renderDiff(before: Snapshot, after: Snapshot): string {
  const baseline = new Map(Object.entries(before).map(([label, readings]) => [setupName(label), readings]));
  const groups = Object.entries(after).flatMap(([label, readings]) => {
    const old = baseline.get(setupName(label));
    if (old === undefined) return [`${label}\n  not in the baseline`];
    const lines = READINGS.flatMap((reading) => {
      const was = old[reading.id] ?? {};
      const changes = Object.entries(readings[reading.id] ?? {}).flatMap(([day, sample]) => {
        if (!Object.hasOwn(was, day)) return [];
        const from = split(was[day]);
        const to = split(sample);
        if (from.grade === to.grade && !moved(from.value, to.value, reading.digits)) return [];
        return [`${day} ${show(from, reading.digits)} → ${show(to, reading.digits)}`];
      });
      return changes.length === 0 ? [] : [`  ${reading.label.padEnd(14)} ${changes.join('   ')}`];
    });
    return lines.length === 0 ? [] : [[label, ...lines].join('\n')];
  });
  return groups.length === 0 ? 'no change' : groups.join('\n\n');
}
