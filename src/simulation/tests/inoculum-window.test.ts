/**
 * The derivation behind `inoculumPerLiter`, re-run rather than retold.
 *
 * The config comment claims a passing window, and claims the shipped value is
 * its middle. This sweeps the grid that claim was read off and asserts the
 * claim itself — including that the values just outside the window fail, and
 * fail for the reasons the comment gives. A constant that moves without its
 * comment moving breaks this.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { formatTable, sweep, tuned } from './sweep.js';
import { cycledTank, doseClearance, traceCycle } from './tanks.js';

/** Every volume the anchors claim the same timeline across. */
const VOLUMES = [10, 20, 40, 75, 150, 300, 1000] as const;

/** The window the config comment states, and the first grid point outside each edge. */
const WINDOW_LOW = 0.597;
const WINDOW_HIGH = 0.680;
const BELOW_WINDOW = 0.596;
const ABOVE_WINDOW = 0.681;

const at = (inoculumPerLiter: number): TunableConfig =>
  tuned((draft) => {
    draft.nitrogenCycle.inoculumPerLiter = inoculumPerLiter;
  });

interface Outcome {
  peakPpm: number;
  peakDay: number;
  cycledDay: number | null;
  dose24h: number;
}

function outcome(litres: number, config: TunableConfig): Outcome {
  const { nitritePeakPpm, nitritePeakDay, cycledDay } = traceCycle(litres, { config });
  return {
    peakPpm: nitritePeakPpm,
    peakDay: nitritePeakDay,
    cycledDay,
    dose24h: doseClearance(cycledTank(litres, { config }), { config }),
  };
}

/** Which anchors a point breaks, named the way the bands are written. */
function breaks({ peakPpm, peakDay, cycledDay, dose24h }: Outcome): string[] {
  const failures: string[] = [];
  if (peakPpm < 2 || peakPpm > 5) failures.push('nitrite peak off 2–5 ppm');
  if (peakDay < 12 || peakDay > 16) failures.push('peak off day 12–16');
  if (cycledDay === null || cycledDay < 21) failures.push('cycles before day 21');
  else if (cycledDay > 28) failures.push('cycles after day 28');
  if (dose24h >= 0.25) failures.push('dose not cleared');
  return failures;
}

// Each row of the grid is a full 70-day trace plus a 31-day dose challenge, so the
// sweep costs ~50k ticks — seconds rather than milliseconds, and several times that
// again under the v8 instrumentation `test:coverage` runs. Vitest's 5 s default is a
// unit-test default; this is a calibration sweep and needs to be told so.
describe('inoculumPerLiter — the window behind the shipped value', { timeout: 60_000 }, () => {
  it('holds every anchor at every volume, right across the stated window', () => {
    const rows = sweep(
      {
        inoculumPerLiter: [WINDOW_LOW, nitrogenCycleDefaults.inoculumPerLiter, WINDOW_HIGH],
        litres: VOLUMES,
      },
      ({ inoculumPerLiter, litres }) => {
        const measured = outcome(litres, at(inoculumPerLiter));
        return { ...measured, breaks: breaks(measured).join(', ') };
      }
    );
    // On a break the whole grid comes out as the message, which is the table a
    // calibration run report quotes — the derivation, not a retelling of it.
    expect(
      rows.filter((row) => row.breaks !== ''),
      `\n${formatTable(rows.map((row) => ({ ...row, breaks: row.breaks || '—' })))}`
    ).toEqual([]);
  });

  it('fails below the window because the nitrite peak clears 5 ppm', () => {
    const peaks = VOLUMES.map((litres) => outcome(litres, at(BELOW_WINDOW)).peakPpm);

    expect(Math.max(...peaks)).toBeGreaterThan(5);
  });

  it('fails above the window because a tank cycles before day 21', () => {
    const days = VOLUMES.map((litres) => outcome(litres, at(ABOVE_WINDOW)).cycledDay ?? Infinity);

    expect(Math.min(...days)).toBeLessThan(21);
  });

  it('ships the middle of that window, on the margins the comment quotes', () => {
    const measured = VOLUMES.map((litres) => outcome(litres, DEFAULT_CONFIG));

    expect(nitrogenCycleDefaults.inoculumPerLiter).toBeCloseTo((WINDOW_LOW + WINDOW_HIGH) / 2, 4);
    expect(5 - Math.max(...measured.map((o) => o.peakPpm))).toBeCloseTo(0.047, 3);
    expect(Math.min(...measured.map((o) => o.cycledDay ?? 0)) - 21).toBeCloseTo(0.208, 3);
  });
});
