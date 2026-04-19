/**
 * Calibration runner for scenario 01: uncycled quarantine disaster.
 *
 * Sets up 10 neon tetras in a 38 L bare-bottom HOB-filtered tank with
 * no bacteria seeded and feeds 0.10 g/day via scheduled action. Traces
 * NH3, NO2, NO3, AOB, NOB, waste, food, and fish (count + avg health)
 * every 24 h for the 10-day primary horizon.
 */

import { runScenario, addFish } from '../src/simulation/calibration/helpers.js';
import type { SimulationConfig, SimulationState } from '../src/simulation/state.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../src/simulation/config/index.js';
import { getPpm } from '../src/simulation/resources/helpers.js';

interface DailyRow {
  day: number;
  tick: number;
  nh3: number;
  no2: number;
  no3: number;
  aob: number;
  nob: number;
  waste: number;
  food: number;
  fish: number;
  health: number;
  temp: number;
  ph: number;
  o2: number;
}

export function runUncycledScenario(options: {
  tankLiters?: number;
  fishCount?: number;
  foodPerDay?: number;
  days?: number;
  waterChangeFraction?: number;
  seedBacteria?: boolean;
  config?: TunableConfig;
  label?: string;
  every?: number; // sampling interval in hours
}): { rows: DailyRow[]; final: SimulationState } {
  const {
    tankLiters = 38,
    fishCount = 10,
    foodPerDay = 0.10,
    days = 10,
    waterChangeFraction = 0,
    seedBacteria = false,
    config = DEFAULT_CONFIG,
    every = 24,
  } = options;

  const setup: SimulationConfig = {
    tankCapacity: tankLiters,
    roomTemperature: 22,
    tapWaterTemperature: 22,
    tapWaterPH: 7.0,
    heater: { enabled: true, targetTemperature: 25, wattage: 50 },
    filter: { enabled: true, type: 'hob' },
    light: {
      enabled: true,
      wattage: 8,
      schedule: { startHour: 8, duration: 10 },
    },
    substrate: { type: 'none' }, // bare bottom per scenario
    hardscape: { items: [] },
    lid: { type: 'none' },
    ato: { enabled: false },
    co2Generator: { enabled: false },
    powerhead: { enabled: false },
  };

  const totalTicks = days * 24;

  // Feed daily at tick 0 (scheduled action before tick 1) and every 24 h after.
  const actions = Array.from({ length: days }, (_, i) => ({
    tick: i * 24 + 1, // before tick 1, 25, 49, ...
    action: { type: 'feed' as const, amount: foodPerDay },
  }));
  if (waterChangeFraction > 0) {
    for (let d = 1; d < days; d++) {
      // snap to 0.5 if needed; actions layer supports discrete values
      actions.push({
        tick: d * 24 + 1,
        // @ts-expect-error — waterChange action shape uses discrete fraction
        action: { type: 'waterChange', amount: waterChangeFraction },
      });
    }
  }

  const rows: DailyRow[] = [];
  const sample = (state: SimulationState) => {
    const r = state.resources;
    const avgHealth = state.fish.length
      ? state.fish.reduce((s, f) => s + f.health, 0) / state.fish.length
      : 0;
    rows.push({
      day: Math.floor(state.tick / 24),
      tick: state.tick,
      nh3: getPpm(r.ammonia, r.water),
      no2: getPpm(r.nitrite, r.water),
      no3: getPpm(r.nitrate, r.water),
      aob: r.aob,
      nob: r.nob,
      waste: r.waste,
      food: r.food,
      fish: state.fish.length,
      health: avgHealth,
      temp: r.temperature,
      ph: r.ph,
      o2: r.oxygen,
    });
  };

  const final = runScenario({
    setup,
    ticks: totalTicks,
    actions,
    config,
    beforeStart: (state) => {
      let s = addFish(state, 'neon_tetra', fishCount);
      if (seedBacteria) {
        const maxB = s.resources.surface * config.nitrogenCycle.bacteriaPerCm2;
        // produce via immer through helpers lookalike
        s = {
          ...s,
          resources: { ...s.resources, aob: maxB, nob: maxB },
        };
      }
      sample(s); // tick 0 snapshot
      return s;
    },
    afterTick: (state, tickNumber) => {
      if (tickNumber % every === 0) sample(state);
    },
  });

  return { rows, final };
}

function formatTable(rows: DailyRow[], label: string): string {
  const header =
    'day  tick  NH3    NO2    NO3    AOB       NOB       waste  food   fish  hp   O2    pH';
  const sep = '-'.repeat(header.length);
  const body = rows
    .map(
      (r) =>
        `${String(r.day).padStart(3)} ${String(r.tick).padStart(5)} ` +
        `${r.nh3.toFixed(3).padStart(6)} ${r.no2.toFixed(3).padStart(6)} ` +
        `${r.no3.toFixed(2).padStart(6)} ${r.aob.toFixed(0).padStart(9)} ` +
        `${r.nob.toFixed(0).padStart(9)} ${r.waste.toFixed(3).padStart(6)} ` +
        `${r.food.toFixed(3).padStart(6)} ${String(r.fish).padStart(5)} ` +
        `${r.health.toFixed(0).padStart(3)} ${r.o2.toFixed(2).padStart(5)} ` +
        `${r.ph.toFixed(2).padStart(4)}`
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
  const days = Number(args.days ?? 10);
  const foodPerDay = Number(args.food ?? 0.1);
  const every = Number(args.every ?? 24);
  const seedBacteria = args.seed === 'true';
  const waterChangeFraction = Number(args.wc ?? 0);
  const { rows } = runUncycledScenario({
    days,
    foodPerDay,
    every,
    seedBacteria,
    waterChangeFraction,
    label: args.label,
  });
  const label =
    args.label ??
    `uncycled, food=${foodPerDay}, days=${days}${seedBacteria ? ', seeded' : ''}${waterChangeFraction ? `, wc=${waterChangeFraction}` : ''}`;
  process.stdout.write(formatTable(rows, label) + '\n');
}
