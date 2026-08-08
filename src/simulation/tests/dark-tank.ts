/**
 * What darkness costs a plant, read five ways.
 *
 * Every other channel is held at optimum, so the fixture is the only thing free
 * to hurt it. `on` is the control. `OFF` is a fixture that never comes on —
 * the extreme, and the one that says whether the channel exists at all.
 * `BLACKOUT` is the scenario a keeper actually produces: grown in under light,
 * then switched off with a full bank, which is the only run where the lag
 * between darkness and damage can show up. Past those three: what a shorter
 * photoperiod costs, where each species' compensation point lands, and what a
 * plant that has only just arrived does on its first days. Run it:
 *
 *     npm run probe:dark-tank
 */

import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { DEFAULT_LIGHT } from '../equipment/light.js';
import {
  getSaturationIrradiance,
  PLANT_SPECIES_DATA,
  type PlantSpecies,
} from '../plants/species.js';
import { computePlantVitality } from '../systems/plant-vitality.js';
import { formatTable } from './sweep.js';
import { runTank } from './metrics.js';
import { atOptimum, fixtureFor, substrateFor } from './tanks.js';

const CAPACITY = 40;
const DAYS = 90;
const PLANTED_AT = 35;
const RNG_SEED = 5;

/** Days the blackout run spends lit first — long enough to fill a bank. */
const GROW_DAYS = 30;

/** Days after the switch the blackout trace prints, one row each. */
const TRACE_DAYS = 10;

type Mode = 'on' | 'off' | 'blackout';

const setup = (lit: boolean): SimulationConfig => ({
  tankCapacity: CAPACITY,
  heater: { enabled: false },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  hardscape: { items: [] },
  lid: { type: 'full' },
  ato: { enabled: true },
  co2Generator: { enabled: true, bubbleRate: 1.0, schedule: { startHour: 7, duration: 10 } },
  powerhead: { enabled: false },
  light: { enabled: lit },
});

/** The same tank on a named fixture and photoperiod rather than the default one. */
const withLight = (par: number, hours: number): SimulationConfig => ({
  ...setup(true),
  light: { enabled: true, par, schedule: { startHour: 8, duration: hours } },
});

/**
 * Everything the light channel is not, held where a plant would want it — and
 * on a blackout run, the fixture switched off once the plant has grown in.
 */
const held = (mode: Mode) => (state: SimulationState): SimulationState =>
  produce(atOptimum(state), (draft) => {
    if (mode === 'blackout' && draft.tick >= GROW_DAYS * 24) {
      draft.equipment.light.enabled = false;
    }
  });

const SPECIES: PlantSpecies[] = [
  'anubias',
  'java_fern',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

const MODES: Mode[] = ['on', 'off', 'blackout'];

const one = (species: PlantSpecies, size = PLANTED_AT): { plants: [{ species: PlantSpecies; count: number; size: number }]; bacteria: 'cycled' } => ({
  bacteria: 'cycled',
  plants: [{ species, count: 1, size }],
});

/** § 1 — the three runs, and what each planting reads at 90 days. */
function threeWays(): string {
  return formatTable(
    SPECIES.flatMap((species) =>
      MODES.map((mode) => {
        const run = runTank({
          setup: setup(mode !== 'off'),
          seed: one(species),
          days: DAYS,
          routine: { hold: held(mode) },
          rngSeed: RNG_SEED,
        });

        const plant = run.final.plants[0];
        const vitality = plant
          ? computePlantVitality({
              plant,
              resources: run.final.resources,
              waterVolume: run.final.resources.water,
              plantsConfig: DEFAULT_CONFIG.plants,
              nutrientSufficiency: 1,
              algaeMass: run.final.algae.mass,
            })
          : undefined;

        return {
          species,
          lightLo: PLANT_SPECIES_DATA[species].tolerableLight[0],
          lights: mode === 'on' ? 'on' : mode === 'off' ? 'never on' : `off d${GROW_DAYS}`,
          size: plant?.size.toFixed(1) ?? '—',
          condition: plant?.condition.toFixed(1) ?? '—',
          surplus: plant?.surplus.toFixed(1) ?? '—',
          net: vitality ? vitality.breakdown.net.toFixed(3) : '—',
          died: run.plantDeaths.map((death) => `d${death.day.toFixed(0)}`).join(' ') || '—',
        };
      })
    )
  );
}

/** § 2 — the days either side of the switch, for one species, one row a day. */
function blackoutTrace(species: PlantSpecies): string {
  const trace: string[] = [];
  runTank({
    setup: setup(true),
    seed: one(species),
    days: GROW_DAYS + TRACE_DAYS,
    routine: { hold: held('blackout') },
    rngSeed: RNG_SEED,
    watch: (hour, _before, after) => {
      const day = hour / 24;
      if (!Number.isInteger(day) || day < GROW_DAYS - 1) return;
      const plant = after.plants[0];
      trace.push(
        `  d${String(day).padStart(3)}  size ${(plant?.size ?? 0).toFixed(1).padStart(6)}` +
          `  condition ${(plant?.condition ?? 0).toFixed(1).padStart(5)}` +
          `  bank ${(plant?.surplus ?? 0).toFixed(1).padStart(5)}`
      );
    },
  });
  return trace.join('\n');
}

const PHOTOPERIODS = [4, 6, 8, 10, 12, 16];

/**
 * § 3 — the same fixture for fewer hours. Maintenance is charged around the
 * clock and income only arrives while the lamps are on, so the photoperiod is
 * the ratio between them: this is where it stops being a lever and becomes a
 * cliff.
 */
function photoperiod(): string {
  return formatTable(
    SPECIES.flatMap((species) =>
      PHOTOPERIODS.map((hours) => {
        const run = runTank({
          setup: withLight(DEFAULT_LIGHT.par, hours),
          seed: one(species),
          days: DAYS,
          routine: { hold: held('on') },
          rngSeed: RNG_SEED,
        });
        const plant = run.final.plants[0];
        return {
          species,
          hours,
          size: plant?.size.toFixed(1) ?? '—',
          condition: plant?.condition.toFixed(1) ?? '—',
          bank: plant?.surplus.toFixed(1) ?? '—',
          died: run.plantDeaths.map((death) => `d${death.day.toFixed(0)}`).join(' ') || '—',
        };
      })
    )
  );
}

/** The water of a fresh tank of this size, so a net can be read off a state. */
const PROBE_WATER = runTank({ setup: setup(true), days: 0 }).final.resources;

/** Net rate for a provisioned plant of `species` at `light`, everything else optimum. */
function netAt(species: PlantSpecies, light: number): number {
  return computePlantVitality({
    plant: {
      id: 'probe',
      species,
      size: PLANTED_AT,
      condition: 100,
      surplus: DEFAULT_CONFIG.plants.surplusCap,
    },
    resources: { ...PROBE_WATER, light, co2: 20, ph: 7, temperature: 25 },
    waterVolume: CAPACITY,
    plantsConfig: DEFAULT_CONFIG.plants,
    nutrientSufficiency: 1,
    algaeMass: 0,
  }).breakdown.net;
}

/**
 * The PAR where that net first turns positive, to a tenth of a PAR unit.
 *
 * Bisected below the top of the species' band, where the net is monotone in
 * PAR. Above it the light-excessive stressor takes the net back down, so a
 * search over the whole range would find the wrong root.
 */
function compensationPar(species: PlantSpecies): number {
  let lo = 0;
  let hi = PLANT_SPECIES_DATA[species].tolerableLight[1];
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    if (netAt(species, mid) > 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Whether a 90 d run under a fixture landing `substratePar` ends at full condition. */
function holds(species: PlantSpecies, substratePar: number): boolean {
  const run = runTank({
    setup: withLight(fixtureFor(substratePar, CAPACITY), DEFAULT_LIGHT.schedule.duration),
    seed: one(species),
    days: DAYS,
    routine: { hold: held('on') },
    rngSeed: RNG_SEED,
  });
  return run.final.plants[0]?.condition === 100;
}

/** The dimmest substrate PAR the default photoperiod holds a plant at full condition on. */
function holdingPar(species: PlantSpecies): number {
  let lo = 0;
  let hi = PLANT_SPECIES_DATA[species].tolerableLight[1];
  for (let step = 0; step < 9; step++) {
    const mid = (lo + hi) / 2;
    if (holds(species, mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * § 4 — where each species stops paying its own way, against the `Ik` its
 * saturation is quoted on.
 *
 * Two readings, and the distance between them is the photoperiod. `net = 0`
 * is the hour's own balance for a provisioned plant — the compensation point
 * `maintenanceCost` is quoted against, and for the two shade species it lands
 * where the macrophyte literature puts it. `holds` is the dimmest fixture the
 * whole day balances under: income arrives for 10 hours and maintenance is
 * charged for 24, so a plant needs several times its compensation point on the
 * clock to end the run at full condition. Below that line it declines with
 * every other channel at optimum, which is what dim means here.
 */
function compensationPoint(): string {
  return formatTable(
    SPECIES.map((species) => {
      const ik = getSaturationIrradiance(species, DEFAULT_CONFIG.plants);
      const par = compensationPar(species);
      const day = holdingPar(species);

      return {
        species,
        ik,
        bandLo: PLANT_SPECIES_DATA[species].tolerableLight[0],
        'net = 0 at': par.toFixed(1),
        '× Ik': (par / ik).toFixed(3),
        'holds above': day.toFixed(1),
        '× Ik ': (day / ik).toFixed(3),
      };
    })
  );
}

/**
 * § 5 — a plant on the day it goes in. It arrives with a reserve rather than an
 * empty bank, so what this asks is whether the first days are growth or a melt.
 */
function establishment(): string {
  return formatTable(
    SPECIES.map((species) => {
      const days: Record<string, string> = {};
      const run = runTank({
        setup: setup(true),
        seed: one(species),
        days: 7,
        routine: { hold: held('on') },
        rngSeed: RNG_SEED,
        watch: (hour, _before, after) => {
          const day = hour / 24;
          if (!Number.isInteger(day) || day > 7) return;
          const plant = after.plants[0];
          days[`d${day}`] = plant
            ? `${plant.size.toFixed(1)}/${plant.surplus.toFixed(0)}`
            : 'died';
        },
      });
      return {
        species,
        'planted at': PLANTED_AT,
        ...days,
        condition: run.final.plants[0]?.condition.toFixed(0) ?? '—',
      };
    })
  );
}

const SUBSTRATE_PAR = substrateFor(DEFAULT_LIGHT.par, CAPACITY);

const SECTIONS: Array<[string, () => string]> = [
  [`three ways, ${DAYS} d`, threeWays],
  [`monte carlo, lights out on day ${GROW_DAYS}`, (): string => blackoutTrace('monte_carlo')],
  [`anubias, lights out on day ${GROW_DAYS}`, (): string => blackoutTrace('anubias')],
  [`the default fixture for fewer hours, ${DAYS} d`, photoperiod],
  ['the compensation point, against the fixture a day balances under', compensationPoint],
  ['the first week of a plant that has just gone in — size/bank', establishment],
];

process.stdout.write(
  `\n${CAPACITY} L, one plant at size ${PLANTED_AT}, everything but light at optimum.` +
    ` The default fixture is ${DEFAULT_LIGHT.par} PAR for ${DEFAULT_LIGHT.schedule.duration} h,` +
    ` ${SUBSTRATE_PAR.toFixed(1)} at the substrate.\n`
);

for (const [label, section] of SECTIONS) {
  process.stdout.write(`\n— ${label} —\n${section()}\n`);
}
