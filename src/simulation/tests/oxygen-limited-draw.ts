/**
 * What an oxygen consumer does once the oxygen runs out.
 *
 * Two readings. The first is the availability factor itself: what each consumer
 * asks for at a given dissolved oxygen, against what it asked for before there
 * was a factor at all. The second is the consequence at the tank — how much
 * oxygen gets drawn that was never in the water, and therefore how much carbon
 * the tank emits without having paid for it.
 *
 * The counterfactual is the same engine with every half-saturation constant
 * taken to nothing, which is the unbounded draw this branch replaced.
 *
 *     npm run probe:oxygen-limited-draw
 */

import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { decaySystem } from '../systems/decay.js';
import { processPlants } from '../plants/index.js';
import { processLivestock } from '../livestock/index.js';
import { formatTable, tuned } from './sweep.js';
import { runTank } from './metrics.js';

/** A small warm tank with nothing in it that moves water. */
const STAGNANT: SimulationConfig = {
  tankCapacity: 20,
  heater: { enabled: true, targetTemperature: 30, wattage: 100 },
  filter: { enabled: false },
  ato: { enabled: true },
  light: { enabled: true, par: 50, schedule: { startHour: 8, duration: 12 } },
  substrate: { type: 'aqua_soil' },
};

/** The same box with the circulation a keeper would actually give it. */
const AERATED: SimulationConfig = {
  ...STAGNANT,
  filter: { enabled: true, type: 'sponge' },
  airPump: { enabled: true },
};

const eight = (size: number): PresetSeed => ({
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 8, sex: 'female' }],
  plants: [{ species: 'java_fern', count: 4, size }],
});

/** Every half-saturation constant taken to nothing: the draw as it was. */
const UNBOUNDED: TunableConfig = tuned((draft) => {
  draft.decay.oxygenHalfSaturation = 0;
  draft.plants.respirationOxygenHalfSaturation = 0;
  draft.livestock.respirationOxygenHalfSaturation = 0;
});

// ---------------------------------------------------------------------------
// 1. The factor itself
// ---------------------------------------------------------------------------

/** Oxygen each consumer asks of one held state for one hour, mg/L. */
function draws(state: SimulationState, config: TunableConfig): Record<string, number> {
  const effects = [
    ...decaySystem.update(state, config),
    ...processPlants(state, config).effects,
    ...processLivestock(state, config).effects,
  ];
  const from = (source: string): number =>
    -effects
      .filter((effect) => effect.resource === 'oxygen' && effect.source === source)
      .reduce((sum, effect) => sum + effect.delta, 0);

  return { decay: from('decay'), fish: from('fish-respiration'), plants: from('respiration') };
}

/** The carbon the same hour emits, mg/L — derived from the oxygen, so it tracks. */
function carbon(state: SimulationState, config: TunableConfig): number {
  const effects = [
    ...decaySystem.update(state, config),
    ...processLivestock(state, config).effects,
  ];
  return effects
    .filter((effect) => effect.resource === 'co2' && effect.source !== 'photosynthesis')
    .reduce((sum, effect) => sum + effect.delta, 0);
}

const startingTank = runTank({ setup: STAGNANT, seed: eight(60), days: 1, rngSeed: 4242 }).final;

function atOxygen(oxygen: number): Record<string, unknown> {
  const held = produce(startingTank, (draft) => {
    draft.resources.oxygen = oxygen;
    draft.resources.food = 5;
  });
  const limited = draws(held, DEFAULT_CONFIG);
  const unbounded = draws(held, UNBOUNDED);
  const share = (key: string): string =>
    unbounded[key] > 0 ? (limited[key] / unbounded[key]).toFixed(3) : '—';

  return {
    'O2 mg/L': oxygen.toFixed(2),
    decay: limited.decay.toFixed(4),
    'of full': share('decay'),
    fish: limited.fish.toFixed(4),
    'of full ': share('fish'),
    plants: limited.plants.toFixed(4),
    'of full  ': share('plants'),
    'CO2 out': carbon(held, DEFAULT_CONFIG).toFixed(4),
  };
}

process.stdout.write(
  '\nWhat each consumer asks for in an hour, against the oxygen it is asking of\n' +
    '(mg/L/h, beside the share of the unbounded draw it now wants)\n\n' +
    `${formatTable([8, 6, 4, 2, 1, 0.5, 0.25, 0.1, 0].map(atOxygen))}\n`
);

// ---------------------------------------------------------------------------
// 2. The consequence at the tank
// ---------------------------------------------------------------------------

interface Overdraw {
  /** Lowest the tank ever reads, mg/L. */
  floor: number;
  /** Hours the tick asked for more oxygen than the tank was holding. */
  hours: number;
  /** Oxygen drawn across the run that was never there, mg/L. */
  unpaid: number;
  /** The carbon that oxygen would have paid for, mg/L of CO2. */
  phantomCarbon: number;
}

/**
 * A run, watching each hour for a draw the water could not cover.
 *
 * Read off the state the hour opened with rather than off the effects the tick
 * applied: the three consumers sit in two different tiers, so the shortfall the
 * engine actually meets depends on their order, while what they *asked* for
 * does not. This is the demand side, which is the side the factor moves.
 */
function overdraw(setup: SimulationConfig, seed: PresetSeed, config: TunableConfig): Overdraw {
  let floor = Infinity;
  let hours = 0;
  let unpaid = 0;

  runTank({
    setup,
    seed,
    days: 6,
    rngSeed: 4242,
    routine: { config, feed: 1 },
    watch: (_hour, before, after) => {
      floor = Math.min(floor, after.resources.oxygen);
      const asked = Object.values(draws(before, config)).reduce((sum, draw) => sum + draw, 0);
      const short = asked - before.resources.oxygen;
      if (short > 0) {
        hours += 1;
        unpaid += short;
      }
    },
  });

  return { floor, hours, unpaid, phantomCarbon: unpaid * O2_TO_CO2_MASS_RATIO };
}

const cases = [
  ['stagnant 20 L, 240 plant size', STAGNANT, eight(60)],
  ['stagnant 20 L, 600 plant size', STAGNANT, eight(150)],
  ['sponge + air, 600 plant size', AERATED, eight(150)],
] as const;

process.stdout.write(
  '\n\nOxygen drawn that was never in the water, over six days fed 1 g/day\n\n' +
    formatTable(
    cases.flatMap(([label, setup, seed]) =>
      ([
        ['unbounded', UNBOUNDED],
        ['saturating', DEFAULT_CONFIG],
      ] as const).map(([draw, config]) => {
        const run = overdraw(setup, seed, config);
        return {
          tank: label,
          draw,
          'O2 low': run.floor.toFixed(4),
          'overdrawn h': run.hours,
          'unpaid O2': run.unpaid.toFixed(2),
          'phantom CO2': run.phantomCarbon.toFixed(2),
        };
      })
    )
    ) +
    '\n'
);
process.stdout.write(
  '\nThe O2 low column is the reading each hour closes on, not the low the hour passed\n' +
    'through: gas exchange shares the passive tier with decay and refills what the tick\n' +
    'emptied. The demand columns are the exact ones — a tick is an hour, so a consumer\n' +
    'whose reduced demand still outruns the standing stock overshoots inside the step,\n' +
    'and the last of the overdraw goes with tick resolution rather than with the factor.\n'
);
