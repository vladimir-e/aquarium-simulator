/**
 * Algae against substrate PAR, across the `lightExcessThreshold` line.
 *
 * The question a threshold constant has to answer is what crossing it costs,
 * and a fixture cannot be pointed at a substrate PAR directly — the box in
 * between decides. So the fixture is solved backwards from the reading wanted
 * on the floor, one tank held fixed, and the line is swept from well under to
 * well over. Run it:
 *
 *     npm run probe:par-dose-response
 */

import { calculateTankHeight, type SimulationConfig } from '../state.js';
import { calculateParAtDepth } from '../equipment/light.js';
import { opticsDefaults } from '../config/optics.js';
import { algaeVitalityDefaults as algae } from '../config/algae-vitality.js';
import { getPresetById } from '../presets.js';
import type { PresetSeed } from '../seed.js';
import { formatTable } from './sweep.js';
import { runTank } from './metrics.js';
import { fixtureFor } from './tanks.js';

/** The same tank under a different fixture, and optionally a different box. */
function withLight(setup: SimulationConfig, par: number, capacity?: number): SimulationConfig {
  return {
    ...setup,
    tankCapacity: capacity ?? setup.tankCapacity,
    light: { ...setup.light, enabled: par > 0, par },
  };
}

const CAPACITY = 40;
const DAYS = 90;
/** Samples are taken at noon, so a 90-day run's last one is day 89's, not 90's. */
const LAST_DAY = DAYS - 1;
const RNG_SEED = 4242;

/** Substrate PAR readings to sweep, straddling the threshold. */
const TARGETS = [40, 50, 60, 65, 68.6, 70, 72, 75, 80, 90, 100, 114.3, 126];

const PLANTING: PresetSeed['plants'] = [
  { species: 'amazon_sword', count: 2, size: 35 },
  { species: 'monte_carlo', count: 2, size: 35 },
  { species: 'java_fern', count: 1, size: 35 },
];

const depth = calculateTankHeight(CAPACITY);

/** What the excess-light stressor charges at a given substrate PAR, %/h. */
function excessLightRate(substratePar: number): number {
  const over = Math.max(0, substratePar - algae.lightExcessThreshold);
  return Math.min(algae.excessLightPeak, algae.excessLightSeverity * over);
}

function sweepAt(seed: PresetSeed): string {
  const planted = getPresetById('planted');
  if (planted === undefined) throw new Error('no planted preset to sweep');

  return formatTable(
    TARGETS.map((target) => {
      const run = runTank({
        setup: withLight(planted.config, fixtureFor(target, CAPACITY), CAPACITY),
        seed,
        days: DAYS,
        routine: { topOff: true },
        rngSeed: RNG_SEED,
      });
      const last = run.samples[run.samples.length - 1]!;
      const onDay = (day: number): number => {
        const sample = run.samples.find((s) => Math.floor(s.day) === day);
        if (sample === undefined) throw new Error(`no sample on day ${day} of a ${DAYS} d run`);
        return sample.algae;
      };

      return {
        subPAR: calculateParAtDepth(fixtureFor(target, CAPACITY), depth, opticsDefaults),
        excessLight: excessLightRate(target),
        algae30: onDay(30),
        algae60: onDay(60),
        algae89: onDay(LAST_DAY),
        plants89: last.plants,
        size89: last.totalSize,
        cond89: last.avgCondition,
        deaths: run.plantDeaths
          .map((death) => `${death.species.slice(0, 2)}@${death.day.toFixed(0)}`)
          .join(' '),
      };
    })
  );
}

const SCENARIOS: Array<[string, PresetSeed]> = [
  ['planted (5 plants)', { bacteria: 'cycled', plants: PLANTING }],
  ['empty (no plants)', { bacteria: 'cycled' }],
];

for (const [label, seed] of SCENARIOS) {
  process.stdout.write(`\n— ${label}, ${CAPACITY} L, ${DAYS} d —\n${sweepAt(seed)}\n`);
}
