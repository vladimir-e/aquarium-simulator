/**
 * What the nitrogen cycle does on the air a tank actually has.
 *
 * Four readings. The factor itself: what each guild can put through at a given
 * dissolved oxygen. The consequence at the tank: one nitrogen load cycled at
 * four levels of air, so the nitrite that stands is read against the nitrate it
 * should have become. What a colony held under a saturating load settles at,
 * which is no longer its surface. And the control: the shipped constants against
 * the engine as it was before nitrification read oxygen at all, which is the
 * claim that the rates were re-quoted rather than retuned.
 *
 *     npm run probe:nitrification-on-air
 */

import { produce } from 'immer';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { AIR_SATURATED_O2 } from '../config/nitrogen-cycle.js';
import { getPpm } from '../resources/index.js';
import { NH3_TO_NO2_MASS_RATIO } from '../core/chemistry.js';
import { aobCapacity, nitrifierOxygenFactor, nobCapacity } from '../systems/nitrogen-cycle.js';
import { formatTable, tuned } from './sweep.js';
import {
  type Circulation,
  colonyFill,
  cycledTank,
  doseClearance,
  saturatedColony,
  traceCycle,
} from './tanks.js';

/** The two half-saturation constants taken to nothing. */
const NO_OXYGEN_TERM: TunableConfig = tuned((draft) => {
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
});

/**
 * That, plus the four constants back at the figures they held before the term
 * existed — which is what "the engine before this change" has to mean, since
 * neutralising the K's alone leaves the re-quoted rates standing.
 */
const PRE_OXYGEN: TunableConfig = produce(NO_OXYGEN_TERM, (draft) => {
  draft.nitrogenCycle.bacteriaProcessingRate = 0.0002;
  draft.nitrogenCycle.aobGrowthRate = Math.LN2 / 20;
  draft.nitrogenCycle.nobGrowthRate = Math.LN2 / 36;
  draft.nitrogenCycle.inoculumPerLiter = 0.648;
});

// ---------------------------------------------------------------------------
// 1. The factor itself
// ---------------------------------------------------------------------------

const nc = DEFAULT_CONFIG.nitrogenCycle;
const colony = cycledTank(20);

/**
 * Read at population parity, which is where the two rates are quoted against
 * each other: the share of the nitrogen AOB put through that NOB clear behind
 * them. One in the water both rates were measured in, by construction — what
 * the table shows is how far it falls below that as the water thins.
 */
function parity(aobMassPerHour: number, nobMassPerHour: number, populations: number): number {
  return nobMassPerHour / (aobMassPerHour * NH3_TO_NO2_MASS_RATIO * populations);
}

function atOxygen(oxygen: number): Record<string, unknown> {
  const { aob, nob, temperature, water } = colony.resources;
  const aobThroughput = aobCapacity(aob, temperature, oxygen, nc);
  const nobThroughput = nobCapacity(nob, temperature, oxygen, nc);

  return {
    'O2 mg/L': oxygen.toFixed(2),
    'NH3 ppm/h': getPpm(aobThroughput, water).toFixed(4),
    'of max': nitrifierOxygenFactor('aob', oxygen, nc).toFixed(3),
    'NO2 ppm/h': getPpm(nobThroughput, water).toFixed(4),
    'of max ': nitrifierOxygenFactor('nob', oxygen, nc).toFixed(3),
    'NOB : AOB': oxygen > 0 ? parity(aobThroughput, nobThroughput, nob / aob).toFixed(3) : '—',
  };
}

process.stdout.write(
  '\nWhat a cycled 20 L colony can put through, against the oxygen it is asking of\n' +
    '(ppm/h, beside the share of its own maximum each guild is left with)\n\n' +
    `${formatTable([AIR_SATURATED_O2, 6, 4, 2, 1, 0.5, 0.25, 0.1, 0].map(atOxygen))}\n` +
    '\nThe last column is the mechanism in one number: the two guilds balance in the\n' +
    'water their rates were quoted in, and NOB fall behind in every thinner one.\n'
);

// ---------------------------------------------------------------------------
// 2. The consequence at the tank
// ---------------------------------------------------------------------------

/**
 * The same nitrogen through the same box at four levels of air, fed rather than
 * stocked: a fish short of air eats and excretes less, and the load would then
 * be the thing differing between the rows instead of the air.
 */
const AIR: [string, Circulation, number][] = [
  ['sponge + air', { filter: 'sponge', airPump: true }, 0.3],
  ['sponge', { filter: 'sponge' }, 0.3],
  ['still', {}, 0.3],
  ['still, double ration', {}, 0.6],
];

function fedCycle(circulation: Circulation, feed: number, config: TunableConfig): Record<string, unknown> {
  const trace = traceCycle(20, { temperature: 30, days: 60, circulation, feed, config });

  return {
    'O2 low': trace.minOxygen.toFixed(2),
    'NO2 peak': trace.nitritePeakPpm.toFixed(2),
    'peak day': trace.nitritePeakDay.toFixed(1),
    'NO3 then': trace.nitrateAtPeakPpm.toFixed(1),
    'NO2 : NO3': trace.nitrateAtPeakPpm > 0
      ? (trace.nitritePeakPpm / trace.nitrateAtPeakPpm).toFixed(2)
      : '—',
    'cycled day': trace.cycledDay === null ? 'never' : trace.cycledDay.toFixed(1),
  };
}

process.stdout.write(
  '\n\nOne nitrogen load, four levels of air: 20 L at 30 °C on aqua soil, fed for\n' +
    'sixty days with nothing living in it\n\n' +
    formatTable(
      AIR.flatMap(([label, circulation, feed]) =>
        (
          [
            ['shipped', DEFAULT_CONFIG],
            ['no oxygen term', NO_OXYGEN_TERM],
          ] as const
        ).map(([variant, config]) => ({
          tank: label,
          nitrification: variant,
          ...fedCycle(circulation, feed, config),
        }))
      )
    ) +
    '\n\nNO2 : NO3 at the peak is the claim itself — how far the nitrite ran ahead of\n' +
    'the nitrate it should already have become.\n'
);

// ---------------------------------------------------------------------------
// 3. A colony under a load big enough to fill its surface
// ---------------------------------------------------------------------------

process.stdout.write(
  '\n\nA bare 200 L held under more ammonia than it can clear, forty days\n\n' +
    formatTable(
      (
        [
          ['shipped', DEFAULT_CONFIG],
          ['no oxygen term', NO_OXYGEN_TERM],
        ] as const
      ).map(([label, config]) => {
        const state = saturatedColony(200, 40, { config });
        return {
          nitrification: label,
          'AOB % of surface': (colonyFill(state, 'aob') * 100).toFixed(1),
          'NOB % of surface': (colonyFill(state, 'nob') * 100).toFixed(1),
          'O2 mg/L': state.resources.oxygen.toFixed(2),
        };
      })
    ) +
    '\n\nThe surface is not what binds a biofilter: a load big enough to fill it is a\n' +
    'load big enough to strip the oxygen, and NOB are the guild that feels it.\n'
);

// ---------------------------------------------------------------------------
// 4. The control
// ---------------------------------------------------------------------------

const VOLUMES = [10, 20, 40, 75, 150, 300, 1000];

function cycling(label: string, config: TunableConfig): Record<string, unknown>[] {
  return VOLUMES.map((litres) => {
    const { nitritePeakPpm, nitritePeakDay, cycledDay } = traceCycle(litres, { config });
    return {
      nitrification: label,
      litres,
      'NO2 peak': nitritePeakPpm.toFixed(3),
      'peak day': nitritePeakDay.toFixed(2),
      'cycled day': cycledDay === null ? '—' : cycledDay.toFixed(2),
      'dose 24 h': doseClearance(cycledTank(litres, config), { config }).toFixed(4),
    };
  });
}

process.stdout.write(
  '\n\nCycling a fishless tank, shipped against the engine before nitrification read\n' +
    'oxygen at all — the anchors are 2–5 ppm on day 12–16, cycled 21–28, dose < 0.25\n\n' +
    formatTable([...cycling('pre-oxygen', PRE_OXYGEN), ...cycling('shipped', DEFAULT_CONFIG)]) +
    '\n'
);
