/**
 * What the nitrogen cycle does on the air a tank actually has.
 *
 * Four readings. The factor itself: what each guild can put through at a given
 * dissolved oxygen. The consequence at the tank: one nitrogen load cycled at
 * three levels of circulation, so the nitrite that stands is read against the
 * nitrate it should have become. What a colony held under a saturating load
 * settles at, which is no longer its surface. And the control: the shipped
 * constants against the engine as it was before nitrification read oxygen at
 * all, which is the claim that the rates were re-quoted rather than retuned.
 *
 *     npm run probe:nitrification-on-air
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';
import { aobCapacity, nitrifierOxygenFactor, nobCapacity } from '../systems/nitrogen-cycle.js';
import { formatTable, tuned } from './sweep.js';
import {
  DAY,
  type Circulation,
  colonyFill,
  cycledTank,
  doseClearance,
  traceCycle,
} from './tanks.js';

/** The two half-saturation constants taken to nothing. */
const NO_OXYGEN_TERM: TunableConfig = tuned((draft) => {
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
});

/** That, plus the rate constants back at the figures they were quoted as. */
const PRE_OXYGEN: TunableConfig = tuned((draft) => {
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
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

function atOxygen(oxygen: number): Record<string, unknown> {
  const { aob, nob, temperature, water } = colony.resources;
  const aobShare = nitrifierOxygenFactor('aob', oxygen, nc);
  const nobShare = nitrifierOxygenFactor('nob', oxygen, nc);

  return {
    'O2 mg/L': oxygen.toFixed(2),
    'NH3 ppm/h': getPpm(aobCapacity(aob, temperature, oxygen, nc), water).toFixed(4),
    'of max': aobShare.toFixed(3),
    'NO2 ppm/h': getPpm(nobCapacity(nob, temperature, oxygen, nc), water).toFixed(4),
    'of max ': nobShare.toFixed(3),
    'NOB : AOB': aobShare > 0 ? (nobShare / aobShare).toFixed(3) : '—',
  };
}

process.stdout.write(
  '\nWhat a cycled 20 L colony can put through, against the oxygen it is asking of\n' +
    '(ppm/h, beside the share of its own maximum each guild is left with)\n\n' +
    `${formatTable([8.38, 6, 4, 2, 1, 0.5, 0.25, 0.1, 0].map(atOxygen))}\n` +
    '\nThe last column is the mechanism in one number: NOB keep less of their rate\n' +
    'than AOB at every oxygen, so what leaves the first step outruns the second.\n'
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

function saturated(config: TunableConfig): SimulationState {
  let state = produce(createSimulation({ tankCapacity: 200 }), (draft) => {
    draft.resources.aob = 1;
    draft.resources.nob = 1;
  });
  for (let hour = 1; hour <= 40 * DAY; hour++) {
    state = tick(
      produce(state, (draft) => {
        draft.resources.ammonia += getMassFromPpm(2, draft.resources.water);
      }),
      config
    );
  }
  return state;
}

process.stdout.write(
  '\n\nA bare 200 L held under more ammonia than it can clear, forty days\n\n' +
    formatTable(
      (
        [
          ['shipped', DEFAULT_CONFIG],
          ['no oxygen term', NO_OXYGEN_TERM],
        ] as const
      ).map(([label, config]) => {
        const state = saturated(config);
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
