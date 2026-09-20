import type { RunSnapshot } from '../run/index.js';

export interface TickSpan {
  from: number;
  to: number;
}

/**
 * The lit hours the run actually had, read off the buffer — the faint band
 * behind every track, so a plant's flat night and an oxygen sag read against
 * the light that caused them. Each snapshot recorded whether its own hour was
 * lit, so retiming the fixture moves the band from there on and leaves the
 * hours it already ran where they were.
 */
export function photoperiodSpans(snapshots: RunSnapshot[]): TickSpan[] {
  const last = snapshots[snapshots.length - 1];
  if (last === undefined) return [];

  const spans: TickSpan[] = [];
  let dawn: number | null = null;

  for (const snapshot of snapshots) {
    if (snapshot.lightOn) {
      dawn ??= snapshot.tick;
      continue;
    }
    if (dawn !== null) spans.push({ from: dawn, to: snapshot.tick });
    dawn = null;
  }
  if (dawn !== null) spans.push({ from: dawn, to: last.tick + 1 });

  return spans;
}
