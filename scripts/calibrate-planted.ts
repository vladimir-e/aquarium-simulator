/**
 * Calibration runner for scenario 02: heavily planted equilibrium.
 *
 * Supports two main variants (plus fishless/fishful sub-modes):
 *   --variant=A : EI-dosed high-tech (auto-doser on, 1 ml/day)
 *   --variant=B : undosed / fish-waste only
 *
 * Additional flags:
 *   --days=N            : run length in days (default 28)
 *   --every=H           : sampling interval in hours (default 24)
 *   --fishless          : skip fish (pure plant/dosing probe)
 *   --seed              : seed bacteria at carrying capacity (pure fishless/composite probe)
 *   --dose=N            : ml/day of fertilizer (default 1 for A, 0 for B)
 *   --co2               : enable CO2 injection (default true)
 *   --light=W           : light wattage (default 18)
 *   --startSize=P       : starting plant size % (default 35)
 *   --foodPerDay=G      : daily feed amount (default 0.05 g — lean)
 *
 * Outputs a fixed-width table with one row per sample. Columns:
 *   day tick NO3 PO4 K Fe algae AOB NOB NH3 NO2 O2 CO2 pH size cond mc as jf fish hp
 *
 * Following the pattern established by `scripts/calibrate-uncycled.ts`, this
 * script exports a `runPlantedScenario` function for programmatic use from
 * tests / notebooks and runs a formatted table when invoked directly.
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
  Plant,
  PlantSpecies,
} from '../src/simulation/state.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../src/simulation/config/index.js';
import { nitrogenCycleDefaults } from '../src/simulation/config/nitrogen-cycle.js';
import { getPpm } from '../src/simulation/resources/helpers.js';

export interface PlantedRow {
  day: number;
  tick: number;
  hour: number;
  no3: number;
  po4: number;
  k: number;
  fe: number;
  algae: number;
  aob: number;
  nob: number;
  nh3: number;
  no2: number;
  o2: number;
  co2: number;
  ph: number;
  light: number;
  totalSize: number;
  avgCondition: number;
  mcCondition: number;
  asCondition: number;
  jfCondition: number;
  mcSize: number;
  asSize: number;
  jfSize: number;
  fish: number;
  health: number;
}

export interface PlantedScenarioOptions {
  variant?: 'A' | 'B';
  days?: number;
  every?: number;
  fishless?: boolean;
  /** Override dose in ml/day (default 1 ml for A, 0 ml for B). */
  dosePerDay?: number;
  /** Enable CO2 injection (default true). */
  co2Enabled?: boolean;
  /** Seed bacteria at carrying capacity (bypasses cycling). */
  seedBacteria?: boolean;
  /** Daily food grams (default 0.05 g — lean per scenario). */
  foodPerDay?: number;
  /** Starting plant size % (default 35). */
  startingSize?: number;
  /** Light wattage (default 18). */
  lightWattage?: number;
  /** Custom tunable config (defaults to DEFAULT_CONFIG). */
  config?: TunableConfig;
  /** Override plant species list. */
  plantSetup?: Array<{ species: PlantSpecies; count: number }>;
}

export interface PlantedScenarioResult {
  rows: PlantedRow[];
  final: SimulationState;
}

const DEFAULT_PLANTS: Array<{ species: PlantSpecies; count: number }> = [
  { species: 'amazon_sword', count: 2 },
  { species: 'monte_carlo', count: 2 },
  { species: 'java_fern', count: 1 },
];

/**
 * Average condition by species (only surviving plants).
 */
function avgConditionFor(plants: Plant[], species: PlantSpecies): number {
  const filtered = plants.filter((p) => p.species === species);
  if (filtered.length === 0) return 0;
  return filtered.reduce((s, p) => s + p.condition, 0) / filtered.length;
}

function avgSizeFor(plants: Plant[], species: PlantSpecies): number {
  const filtered = plants.filter((p) => p.species === species);
  if (filtered.length === 0) return 0;
  return filtered.reduce((s, p) => s + p.size, 0) / filtered.length;
}

/**
 * Run the planted-equilibrium scenario and return sampled rows + final state.
 */
export function runPlantedScenario(
  options: PlantedScenarioOptions = {}
): PlantedScenarioResult {
  const {
    variant = 'A',
    days = 28,
    every = 24,
    fishless = false,
    co2Enabled = true,
    seedBacteria = false,
    foodPerDay = 0.05,
    startingSize = 35,
    lightWattage = 18,
    config = DEFAULT_CONFIG,
    plantSetup = DEFAULT_PLANTS,
  } = options;

  const dosePerDay =
    options.dosePerDay ?? (variant === 'A' ? 1.0 : 0);

  const tankLiters = 38;

  const setup: SimulationConfig = {
    tankCapacity: tankLiters,
    initialTemperature: 25,
    roomTemperature: 22,
    tapWaterTemperature: 22,
    tapWaterPH: 7.0,
    heater: { enabled: true, targetTemperature: 25, wattage: 50 },
    filter: { enabled: true, type: 'canister' },
    light: {
      enabled: true,
      wattage: lightWattage,
      schedule: { startHour: 8, duration: 8 },
    },
    substrate: { type: 'aqua_soil' },
    // No hardscape — pH is driven by CO2 coupling + tap/neutral, not hardscape pull.
    // Scenario does not mandate hardscape; removing it simplifies pH calibration.
    hardscape: { items: [] },
    lid: { type: 'full' },
    ato: { enabled: false },
    co2Generator: {
      enabled: co2Enabled,
      bubbleRate: 1.5,
      schedule: { startHour: 7, duration: 10 },
    },
    powerhead: { enabled: false },
    airPump: { enabled: false },
    autoDoser: {
      enabled: dosePerDay > 0,
      doseAmountMl: dosePerDay,
      schedule: { startHour: 9, duration: 1 },
    },
  };

  const totalTicks = days * 24;

  // Daily feeding (skip when fishless).
  const actions = fishless
    ? []
    : Array.from({ length: days }, (_, i) => ({
        tick: i * 24 + 1,
        action: { type: 'feed' as const, amount: foodPerDay },
      }));

  const rows: PlantedRow[] = [];
  const sample = (state: SimulationState) => {
    const r = state.resources;
    const plants = state.plants;
    const totalSize = plants.reduce((s, p) => s + p.size, 0);
    const avgCondition =
      plants.length > 0
        ? plants.reduce((s, p) => s + p.condition, 0) / plants.length
        : 0;
    const avgHealth =
      state.fish.length > 0
        ? state.fish.reduce((s, f) => s + f.health, 0) / state.fish.length
        : 0;
    rows.push({
      day: Math.floor(state.tick / 24),
      tick: state.tick,
      hour: state.tick % 24,
      no3: getPpm(r.nitrate, r.water),
      po4: getPpm(r.phosphate, r.water),
      k: getPpm(r.potassium, r.water),
      fe: getPpm(r.iron, r.water),
      algae: r.algae,
      aob: r.aob,
      nob: r.nob,
      nh3: getPpm(r.ammonia, r.water),
      no2: getPpm(r.nitrite, r.water),
      o2: r.oxygen,
      co2: r.co2,
      ph: r.ph,
      light: r.light,
      totalSize,
      avgCondition,
      mcCondition: avgConditionFor(plants, 'monte_carlo'),
      asCondition: avgConditionFor(plants, 'amazon_sword'),
      jfCondition: avgConditionFor(plants, 'java_fern'),
      mcSize: avgSizeFor(plants, 'monte_carlo'),
      asSize: avgSizeFor(plants, 'amazon_sword'),
      jfSize: avgSizeFor(plants, 'java_fern'),
      fish: state.fish.length,
      health: avgHealth,
    });
  };

  // Continuous aqua-soil leach: mimics the slow-release behavior of fresh
  // aquasoil (K, Fe, trace PO4, residual NH4 → NO3 via bacteria). Only
  // the *undosed* scenario (Variant B) relies on this — it's the dominant
  // ongoing nutrient source per the scenario's "residual K/Fe in aqua
  // soil keep Monte Carlo alive at condition > 10" note. Variant A doses
  // daily, and in a real dosed tank the substrate contribution is
  // swamped by the doser by week 2. Tapers linearly over `leachDecayTicks`.
  const leachDecayTicks = 24 * 60; // ~9 weeks
  const leachPerTickBase =
    dosePerDay > 0
      ? null // auto-dosed: rely on the doser, not substrate leach
      : {
          nitrate: 4.0 / 24, // mg/hr → ~96 mg/day fresh soil
          phosphate: 0.4 / 24, // mg/hr → ~10 mg/day
          potassium: 25.0 / 24, // mg/hr → ~600 mg/day fresh; K-rich clay exchange
          iron: 0.3 / 24, // mg/hr → ~7 mg/day
        };

  const beforeTick = leachPerTickBase
    ? (state: SimulationState, t: number): SimulationState => {
        const decay = Math.max(0, 1 - t / leachDecayTicks);
        if (decay <= 0) return state;
        return produce(state, (draft) => {
          draft.resources.nitrate += leachPerTickBase.nitrate * decay;
          draft.resources.phosphate += leachPerTickBase.phosphate * decay;
          draft.resources.potassium += leachPerTickBase.potassium * decay;
          draft.resources.iron += leachPerTickBase.iron * decay;
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
      for (const { species, count } of plantSetup) {
        s = addPlants(s, species, count, startingSize);
      }
      if (!fishless) {
        s = addFish(s, 'neon_tetra', 10);
      }
      // Aqua-soil initial leach: seed tank with one-time reserve of macro/micros
      // so new plantings don't starve instantly while waiting for first dose. The
      // scenario explicitly allows stubbing substrate leaching (§Subsystems).
      // 5 ml of fertilizer equivalent approximates the NH4/K/Fe reserves
      // hobbyists see in the first 1-2 weeks from fresh aqua soil
      // (ADA Amazonia, UNS Controsoil). Variant B relies on this reserve
      // plus the continuous afterTick trickle (below) to avoid an immediate
      // nutrient cliff when the doser is absent.
      const leachMl = 5.0;
      s = {
        ...s,
        resources: {
          ...s.resources,
          nitrate: s.resources.nitrate + leachMl * 50,
          phosphate: s.resources.phosphate + leachMl * 5,
          potassium: s.resources.potassium + leachMl * 40,
          iron: s.resources.iron + leachMl * 1,
        },
      };
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

function formatTable(rows: PlantedRow[], label: string): string {
  const header =
    'day  tick  h   NO3    PO4    K     Fe    algae  AOB     NOB     NH3    NO2    O2    CO2   pH    size  cond  mc   as   jf   fish hp';
  const sep = '-'.repeat(header.length);
  const body = rows
    .map(
      (r) =>
        `${String(r.day).padStart(3)} ${String(r.tick).padStart(5)} ` +
        `${String(r.hour).padStart(2)} ` +
        `${r.no3.toFixed(2).padStart(6)} ` +
        `${r.po4.toFixed(3).padStart(6)} ` +
        `${r.k.toFixed(2).padStart(5)} ` +
        `${r.fe.toFixed(3).padStart(5)} ` +
        `${r.algae.toFixed(1).padStart(5)} ` +
        `${r.aob.toFixed(0).padStart(7)} ` +
        `${r.nob.toFixed(0).padStart(7)} ` +
        `${r.nh3.toFixed(3).padStart(6)} ` +
        `${r.no2.toFixed(3).padStart(6)} ` +
        `${r.o2.toFixed(2).padStart(5)} ` +
        `${r.co2.toFixed(2).padStart(5)} ` +
        `${r.ph.toFixed(2).padStart(5)} ` +
        `${r.totalSize.toFixed(0).padStart(4)} ` +
        `${r.avgCondition.toFixed(0).padStart(4)} ` +
        `${r.mcCondition.toFixed(0).padStart(3)} ` +
        `${r.asCondition.toFixed(0).padStart(3)} ` +
        `${r.jfCondition.toFixed(0).padStart(3)} ` +
        `${String(r.fish).padStart(4)} ` +
        `${r.health.toFixed(0).padStart(3)}`
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
  const variant = (args.variant ?? 'A').toUpperCase() as 'A' | 'B';
  const days = Number(args.days ?? 28);
  const every = Number(args.every ?? 24);
  const fishless = args.fishless === 'true';
  const seedBacteria = args.seed === 'true';
  const co2Enabled = args.co2 !== 'false';
  const dosePerDay = args.dose !== undefined ? Number(args.dose) : undefined;
  const foodPerDay = args.food !== undefined ? Number(args.food) : undefined;
  const startingSize =
    args.startSize !== undefined ? Number(args.startSize) : undefined;
  const lightWattage =
    args.light !== undefined ? Number(args.light) : undefined;

  const { rows } = runPlantedScenario({
    variant,
    days,
    every,
    fishless,
    seedBacteria,
    co2Enabled,
    dosePerDay,
    foodPerDay,
    startingSize,
    lightWattage,
  });
  const label =
    args.label ??
    `planted, variant=${variant}, days=${days}${fishless ? ', fishless' : ''}${seedBacteria ? ', seeded' : ''}${!co2Enabled ? ', noCO2' : ''}${dosePerDay !== undefined ? `, dose=${dosePerDay}` : ''}`;
  process.stdout.write(formatTable(rows, label) + '\n');
}
