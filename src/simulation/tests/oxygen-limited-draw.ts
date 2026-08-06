/**
 * What an oxygen consumer does once the oxygen runs out.
 *
 * Three readings. The first is the availability factor itself: what each of the
 * four consumers asks for at a given dissolved oxygen, against what it asked for
 * before there was a factor at all. The second is the consequence at the tank —
 * how much oxygen gets drawn that was never in the water, and therefore how
 * much carbon the tank emits without having paid for it. The third is what a
 * fish's other metabolic output does with the same factor: deamination runs on
 * oxygen too, so a stocked tank's nitrogen load eases as its air does.
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
import { nitrogenCycleSystem } from '../systems/nitrogen-cycle.js';
import { processPlants } from '../plants/index.js';
import { processLivestock } from '../livestock/index.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';
import { bacteriaReadout } from '../../ui/run/bacteria.js';
import { formatTable, tuned } from './sweep.js';
import { runTank } from './metrics.js';
import { colonyFill, cycledTank, keep, stock } from './tanks.js';

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
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
});

// ---------------------------------------------------------------------------
// 1. The factor itself
// ---------------------------------------------------------------------------

/** Oxygen each consumer asks of one held state for one hour, mg/L. */
function draws(state: SimulationState, config: TunableConfig): Record<string, number> {
  const effects = [
    ...decaySystem.update(state, config),
    ...nitrogenCycleSystem.update(state, config),
    ...processPlants(state, config).effects,
    ...processLivestock(state, config).effects,
  ];
  const from = (...sources: string[]): number =>
    -effects
      .filter((effect) => effect.resource === 'oxygen' && sources.includes(effect.source))
      .reduce((sum, effect) => sum + effect.delta, 0);

  return {
    decay: from('decay'),
    nitrifiers: from('nitrogen-cycle-aob', 'nitrogen-cycle-nob'),
    fish: from('fish-respiration'),
    plants: from('respiration'),
  };
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
  // Food and ammonia both stand past what an hour can get through: the reading
  // is the availability factor, and a consumer short of substrate reads its
  // substrate instead — `min(capacity, what is there)` takes the second.
  const held = produce(startingTank, (draft) => {
    draft.resources.oxygen = oxygen;
    draft.resources.food = 5;
    draft.resources.ammonia = getMassFromPpm(2, draft.resources.water);
  });
  const limited = draws(held, DEFAULT_CONFIG);
  const unbounded = draws(held, UNBOUNDED);
  const asked = (key: string): string =>
    unbounded[key] > 0
      ? `${limited[key].toFixed(4)} (${(limited[key] / unbounded[key]).toFixed(3)})`
      : limited[key].toFixed(4);

  return {
    'O2 mg/L': oxygen.toFixed(2),
    decay: asked('decay'),
    nitrifiers: asked('nitrifiers'),
    fish: asked('fish'),
    plants: asked('plants'),
    'CO2 out': carbon(held, DEFAULT_CONFIG).toFixed(4),
  };
}

process.stdout.write(
  '\nWhat each consumer asks for in an hour, against the oxygen it is asking of\n' +
    '(mg/L/h, with the share of the unbounded draw it now wants in brackets)\n\n' +
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
  /** Oxygen the four consumers asked for across the run, mg/L. */
  asked: number;
  /** How much of that was never there, mg/L. */
  unpaid: number;
  /** The carbon that oxygen would have paid for, mg/L of CO2. */
  phantomCarbon: number;
}

/**
 * A run, watching each hour for a draw the water could not cover.
 *
 * Read off the state the hour opened with rather than off the effects the tick
 * applied: the four consumers sit in two different tiers, so the shortfall the
 * engine actually meets depends on their order, while what they *asked* for
 * does not. This is the demand side, which is the side the factor moves.
 */
function overdraw(setup: SimulationConfig, seed: PresetSeed, config: TunableConfig): Overdraw {
  let floor = Infinity;
  let hours = 0;
  let asked = 0;
  let unpaid = 0;

  runTank({
    setup,
    seed,
    days: 6,
    rngSeed: 4242,
    routine: { config, feed: 1 },
    watch: (_hour, before, after) => {
      floor = Math.min(floor, after.resources.oxygen);
      const want = Object.values(draws(before, config)).reduce((sum, draw) => sum + draw, 0);
      asked += want;
      const short = want - before.resources.oxygen;
      if (short > 0) {
        hours += 1;
        unpaid += short;
      }
    },
  });

  return { floor, hours, asked, unpaid, phantomCarbon: unpaid * O2_TO_CO2_MASS_RATIO };
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
          'asked O2': run.asked.toFixed(2),
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

// ---------------------------------------------------------------------------
// 3. The other metabolic output
// ---------------------------------------------------------------------------

/**
 * What the same factor on ammonia is worth over a season.
 *
 * Oxygen is pinned for the whole run: leave the tank to find its own level and
 * the draw's feedback moves the oxygen underneath the reading, so the rows would
 * differ by the water as well as by the change.
 *
 * The control is close rather than clean, and the loose end is worth knowing.
 * One constant scales deamination *and* the draw, so the unscaled row also
 * breathes at full rate; the pin is re-applied between ticks and not inside one,
 * so within each tick that roster strips a little more oxygen before the passive
 * tier reads it. The bottom pair bounds what that is worth — the roster is dead
 * by day 1.08 there and deamination is zero on both sides for the rest of the
 * run, leaving under 1 % between the rows.
 */
const FISH_UNBOUNDED: TunableConfig = tuned((draft) => {
  draft.livestock.respirationOxygenHalfSaturation = 0;
});

const pinnedAt =
  (oxygen: number) =>
  (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      draft.resources.oxygen = oxygen;
    });

function season(oxygen: number, config: TunableConfig): Record<string, unknown> {
  // Seeded, because the roster's hardiness is a draw: on an unnamed stream the
  // rows below would differ by the luck of the fish as well as by the factor.
  const stocked = stock(cycledTank(40, { config, rngSeed: 4242 }), 'neon_tetra', 12, { sex: 'male' });
  let peakAmmonia = 0;
  let peakNitrite = 0;

  const final = keep(
    stocked,
    90,
    { feed: 0.05, waterChange: 0.25, config, hold: pinnedAt(oxygen) },
    (_hour, _before, after) => {
      peakAmmonia = Math.max(peakAmmonia, getPpm(after.resources.ammonia, after.resources.water));
      peakNitrite = Math.max(peakNitrite, getPpm(after.resources.nitrite, after.resources.water));
    }
  );
  const { rates } = bacteriaReadout(pinnedAt(oxygen)(final), config);

  return {
    'gills ppm/h': rates.gillsToAmmonia.toFixed(5),
    'bed ppm/h': rates.wasteToAmmonia.toFixed(5),
    'NH3 peak': peakAmmonia.toFixed(4),
    'NO2 peak': peakNitrite.toFixed(4),
    'NO3 end': getPpm(final.resources.nitrate, final.resources.water).toFixed(2),
    'AOB % of surface': (colonyFill(final, 'aob', config) * 100).toFixed(3),
    fish: final.fish.length,
  };
}

process.stdout.write(
  '\n\nNinety days of twelve tetras in a cycled 40 L, fed 0.05 g/day with a quarter\n' +
    'of the water out each week, at three pinned oxygens\n\n' +
    formatTable(
      [8.38, 5, 2].flatMap((oxygen) =>
        (
          [
            ['shipped', DEFAULT_CONFIG],
            ['ammonia unscaled', FISH_UNBOUNDED],
          ] as const
        ).map(([variant, config]) => ({
          'O2 mg/L': oxygen.toFixed(2),
          excretion: variant,
          ...season(oxygen, config),
        }))
      )
    ) +
    '\n\nThe biofilter tracks the load down rather than leaving it standing, so what the\n' +
    'factor is worth reads as a smaller colony and less nitrate, not as more ammonia.\n' +
    'At 2 mg/L the roster is dead either way and the gill term is gone with it — the\n' +
    'oxygen a fish suffers at is well above the one its excretion notices.\n'
);
