/**
 * Calibration runner for scenario 04: low-volume stressors.
 *
 * Three variants on the same 19 L hardware:
 *   --variant=A  : baseline filterless betta (8+ weeks, weekly 30 % WC)
 *   --variant=A1 : cold failure (heater disabled at tick 168)
 *   --variant=B  : 10 neons, filterless, no water change (die-off run)
 *
 * Flags:
 *   --days=N        : total days to simulate (defaults vary by variant)
 *   --every=H       : sampling interval in hours (default 24)
 *   --wc=FRACTION   : water-change fraction (default 0.25 for A, 0 for B)
 *   --wcInterval=H  : hours between water changes (default 168 for A)
 *   --label=TEXT    : override table label
 *   --failTick=N    : override heater-failure tick for A1 (default 168)
 *   --seed          : seed bacteria at carrying capacity (skip cycling)
 *
 * Outputs a fixed-width table with day / tick / temp / NH3 / NO2 / NO3 /
 * AOB / NOB / O2 / pH / fish / health.
 */

import { produce } from 'immer';
import {
  runScenario,
  addFish,
  addPlants,
} from '../src/simulation/calibration/helpers.js';
import type {
  SimulationConfig,
  SimulationState,
  FishSpecies,
} from '../src/simulation/state.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../src/simulation/config/index.js';
import { nitrogenCycleDefaults } from '../src/simulation/config/nitrogen-cycle.js';
import { getPpm } from '../src/simulation/resources/helpers.js';

export type LowVolumeVariant = 'A' | 'A1' | 'B';

export interface LowVolumeRow {
  day: number;
  tick: number;
  hour: number;
  temp: number;
  nh3: number;
  no2: number;
  no3: number;
  aob: number;
  nob: number;
  o2: number;
  ph: number;
  fish: number;
  health: number;
  plantCondition: number;
}

export interface LowVolumeScenarioOptions {
  variant?: LowVolumeVariant;
  days?: number;
  every?: number;
  /** Fraction of water replaced per scheduled WC (0.1, 0.25, 0.5, 0.9). */
  waterChangeFraction?: number;
  /** Hours between WCs; 0 = no WC. */
  waterChangeIntervalHours?: number;
  /** Tick at which heater fails for A1 variant. */
  heaterFailureTick?: number;
  /** Seed bacteria at carrying capacity. */
  seedBacteria?: boolean;
  /** Override food grams/day (default scenario-driven). */
  foodPerDay?: number;
  /** Override custom config. */
  config?: TunableConfig;
}

export interface LowVolumeScenarioResult {
  rows: LowVolumeRow[];
  final: SimulationState;
}

interface VariantSpec {
  fishSpecies: FishSpecies;
  fishCount: number;
  foodPerDay: number;
  defaultDays: number;
  defaultWcFraction: number;
  defaultWcInterval: number;
  disableHeater: boolean;
  failureTick?: number;
  /**
   * Default `seedBacteria` for this variant. Variants A and A1 model
   * "minimum-viable betta setup" where the hobbyist has seeded media or
   * started with an established filter cycle — scenario expects stable
   * cycling from day 1. Variant B is the uncycled crisis: overcrowded
   * tank with no bacteria head start, precisely to test the die-off.
   */
  defaultSeed: boolean;
}

const VARIANT_SPECS: Record<LowVolumeVariant, VariantSpec> = {
  A: {
    fishSpecies: 'betta',
    fishCount: 1,
    foodPerDay: 0.03,
    defaultDays: 56,
    defaultWcFraction: 0.25, // closest discrete to scenario's 30 %
    defaultWcInterval: 168,
    disableHeater: false,
    defaultSeed: true,
  },
  A1: {
    fishSpecies: 'betta',
    fishCount: 1,
    foodPerDay: 0.03,
    defaultDays: 21,
    defaultWcFraction: 0.25,
    defaultWcInterval: 168,
    disableHeater: true,
    failureTick: 168,
    defaultSeed: true,
  },
  B: {
    fishSpecies: 'neon_tetra',
    fishCount: 10,
    foodPerDay: 0.05,
    defaultDays: 14,
    defaultWcFraction: 0,
    defaultWcInterval: 0,
    disableHeater: false,
    defaultSeed: false,
  },
};

/**
 * Run a low-volume scenario variant.
 */
export function runLowVolumeScenario(
  options: LowVolumeScenarioOptions = {}
): LowVolumeScenarioResult {
  const { variant = 'A', every = 24, config = DEFAULT_CONFIG } = options;
  const spec = VARIANT_SPECS[variant];
  const seedBacteria = options.seedBacteria ?? spec.defaultSeed;
  const days = options.days ?? spec.defaultDays;
  const foodPerDay = options.foodPerDay ?? spec.foodPerDay;
  const waterChangeFraction = options.waterChangeFraction ?? spec.defaultWcFraction;
  const waterChangeIntervalHours =
    options.waterChangeIntervalHours ?? spec.defaultWcInterval;
  const heaterFailureTick = options.heaterFailureTick ?? spec.failureTick ?? 168;

  const tankLiters = 19;

  const setup: SimulationConfig = {
    tankCapacity: tankLiters,
    initialTemperature: 26,
    roomTemperature: 20,
    tapWaterTemperature: 20,
    tapWaterPH: 7.0,
    heater: { enabled: true, targetTemperature: 26, wattage: 50 },
    // FILTERLESS — bacteria colonize glass + gravel + hardscape + plant only.
    filter: { enabled: false, type: 'hob' },
    light: {
      enabled: true,
      wattage: 5,
      schedule: { startHour: 8, duration: 8 },
    },
    substrate: { type: 'gravel' },
    // 1 small driftwood (650 cm²) + 1 small rock (400 cm²) per scenario.
    hardscape: {
      items: [
        { id: 'driftwood-1', type: 'driftwood' },
        { id: 'rock-1', type: 'neutral_rock' },
      ],
    },
    lid: { type: 'full' },
    ato: { enabled: false },
    co2Generator: { enabled: false },
    powerhead: { enabled: false },
    airPump: { enabled: false },
    autoDoser: { enabled: false },
  };

  const totalTicks = days * 24;

  // Daily feeding.
  const actions: Array<{ tick: number; action: { type: 'feed'; amount: number } | { type: 'waterChange'; amount: 0.1 | 0.25 | 0.5 | 0.9 } }> = [];
  for (let d = 0; d < days; d++) {
    actions.push({ tick: d * 24 + 1, action: { type: 'feed', amount: foodPerDay } });
  }
  if (waterChangeFraction > 0 && waterChangeIntervalHours > 0) {
    const wc = waterChangeFraction as 0.1 | 0.25 | 0.5 | 0.9;
    for (let t = waterChangeIntervalHours; t <= totalTicks; t += waterChangeIntervalHours) {
      // Skip WC if it collides with the heater failure tick for A1 — those are
      // independent real-world events and scheduling them on the same tick
      // (the scenario text doesn't constrain the water-change hour) confuses
      // thermal-drift diagnostics.
      if (spec.disableHeater && t === heaterFailureTick) continue;
      actions.push({ tick: t, action: { type: 'waterChange', amount: wc } });
    }
  }

  const rows: LowVolumeRow[] = [];
  const sample = (state: SimulationState) => {
    const r = state.resources;
    const avgHealth =
      state.fish.length > 0
        ? state.fish.reduce((s, f) => s + f.health, 0) / state.fish.length
        : 0;
    const avgCondition =
      state.plants.length > 0
        ? state.plants.reduce((s, p) => s + p.condition, 0) / state.plants.length
        : 0;
    rows.push({
      day: Math.floor(state.tick / 24),
      tick: state.tick,
      hour: state.tick % 24,
      temp: r.temperature,
      nh3: getPpm(r.ammonia, r.water),
      no2: getPpm(r.nitrite, r.water),
      no3: getPpm(r.nitrate, r.water),
      aob: r.aob,
      nob: r.nob,
      o2: r.oxygen,
      ph: r.ph,
      fish: state.fish.length,
      health: avgHealth,
      plantCondition: avgCondition,
    });
  };

  // A1 disables the heater at the failure tick. We patch via beforeTick so the
  // state flips in place (equipment config mutations via actions aren't wired).
  const beforeTick = spec.disableHeater
    ? (state: SimulationState, tickNumber: number): SimulationState => {
        if (tickNumber !== heaterFailureTick) return state;
        return produce(state, (draft) => {
          draft.equipment.heater.enabled = false;
          draft.equipment.heater.isOn = false;
        });
      }
    : undefined;

  const final = runScenario({
    setup,
    ticks: totalTicks,
    actions,
    config,
    beforeTick,
    beforeStart: (state) => {
      let s = state;
      // 1 anubias on driftwood for Variants A / A1, none for B (scenario B
      // doesn't list a plant, and surface is what drives variant B's problem).
      if (variant !== 'B') {
        s = addPlants(s, 'anubias', 1, 40);
      }
      s = addFish(s, spec.fishSpecies, spec.fishCount);
      if (seedBacteria) {
        const maxB = s.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;
        s = {
          ...s,
          resources: { ...s.resources, aob: maxB, nob: maxB },
        };
      }
      sample(s);
      return s;
    },
    afterTick: (state, tickNumber) => {
      if (tickNumber % every === 0) sample(state);
    },
  });

  return { rows, final };
}

// ---------------------------------------------------------------------------
// CLI formatting
// ---------------------------------------------------------------------------

function formatTable(rows: LowVolumeRow[], label: string): string {
  const header =
    'day tick   h  temp  NH3    NO2    NO3    AOB      NOB      O2    pH   fish hp  cond';
  const sep = '-'.repeat(header.length);
  const body = rows
    .map(
      (r) =>
        `${String(r.day).padStart(3)} ${String(r.tick).padStart(4)} ` +
        `${String(r.hour).padStart(2)} ` +
        `${r.temp.toFixed(2).padStart(5)} ` +
        `${r.nh3.toFixed(3).padStart(6)} ` +
        `${r.no2.toFixed(3).padStart(6)} ` +
        `${r.no3.toFixed(2).padStart(6)} ` +
        `${r.aob.toFixed(0).padStart(8)} ` +
        `${r.nob.toFixed(0).padStart(8)} ` +
        `${r.o2.toFixed(2).padStart(5)} ` +
        `${r.ph.toFixed(2).padStart(4)} ` +
        `${String(r.fish).padStart(4)} ` +
        `${r.health.toFixed(0).padStart(3)} ` +
        `${r.plantCondition.toFixed(0).padStart(4)}`
    )
    .join('\n');
  return `=== ${label} ===\n${header}\n${sep}\n${body}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const eq = a.indexOf('=');
        return eq > 0
          ? [a.slice(2, eq), a.slice(eq + 1)]
          : [a.slice(2), 'true'];
      })
  );
  const variant = (args.variant ?? 'A').toUpperCase().replace('.', '') as LowVolumeVariant;
  const days = args.days !== undefined ? Number(args.days) : undefined;
  const every = Number(args.every ?? 24);
  const wc = args.wc !== undefined ? Number(args.wc) : undefined;
  const wcInterval = args.wcInterval !== undefined ? Number(args.wcInterval) : undefined;
  const failTick = args.failTick !== undefined ? Number(args.failTick) : undefined;
  // Only override the variant default when --seed=true/false is explicit.
  const seedBacteria =
    args.seed === 'true' ? true : args.seed === 'false' ? false : undefined;
  const foodPerDay = args.food !== undefined ? Number(args.food) : undefined;

  const { rows } = runLowVolumeScenario({
    variant,
    days,
    every,
    waterChangeFraction: wc,
    waterChangeIntervalHours: wcInterval,
    heaterFailureTick: failTick,
    seedBacteria,
    foodPerDay,
  });
  const label =
    args.label ??
    `lowvol, variant=${variant}${days !== undefined ? `, days=${days}` : ''}${
      seedBacteria ? ', seeded' : ''
    }`;
  process.stdout.write(formatTable(rows, label) + '\n');
}
