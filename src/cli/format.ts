/**
 * Output formatters for `sim observe` (markdown) and `sim trace` (CSV).
 */

import type { SimulationState } from '../simulation/index.js';
import type { Session } from './session.js';
import type { HistorySnapshot } from './history.js';

/** Convert a mass (mg) to concentration (ppm) given water volume (L). */
function toPpm(massMg: number, waterL: number): number {
  if (waterL <= 0) return 0;
  return massMg / waterL;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function warningSymbol(predicate: boolean): string {
  return predicate ? ' !' : '';
}

/** Render a compact markdown snapshot of the current session. */
export function renderObserve(session: Session): string {
  const state: SimulationState = session.state;
  const r = state.resources;
  const day = Math.floor(state.tick / 24) + 1;
  const name = session.name ? `"${session.name}"` : '(unnamed)';

  const nh3 = round(toPpm(r.ammonia, r.water), 3);
  const no2 = round(toPpm(r.nitrite, r.water), 3);
  const no3 = round(toPpm(r.nitrate, r.water), 2);
  const po4 = round(toPpm(r.phosphate, r.water), 3);

  const waterPct = Math.round((r.water / state.tank.capacity) * 100);
  const stressedFish = state.fish.filter((f) => f.health < 80).length;
  const avgFishHealth = state.fish.length
    ? Math.round(
        state.fish.reduce((s, f) => s + f.health, 0) / state.fish.length
      )
    : 0;
  const avgPlantCondition = state.plants.length
    ? Math.round(
        state.plants.reduce((s, p) => s + p.condition, 0) / state.plants.length
      )
    : 0;

  const aobState = r.aob > 100 ? 'growing' : 'dormant';
  const nobState = r.nob > 100 ? 'growing' : 'dormant';

  const lines: string[] = [
    `# Session: ${name} · Day ${day} · Tick ${state.tick}`,
    '',
    `Tank: ${state.tank.capacity}L @ ${round(r.temperature, 1)}°C · pH ${round(
      r.ph,
      2
    )} · water ${round(r.water, 1)}L (${waterPct}%)`,
    '',
    '**Nitrogen**',
    `- NH3: ${nh3} ppm${warningSymbol(nh3 > 0.1)}`,
    `- NO2: ${no2} ppm${warningSymbol(no2 > 1.0)}`,
    `- NO3: ${no3} ppm${warningSymbol(no3 > 80)}`,
    `- AOB: ${Math.round(r.aob)} (${aobState}) · NOB: ${Math.round(r.nob)} (${nobState})`,
    '',
    `**Gases** O2 ${round(r.oxygen, 2)} · CO2 ${round(r.co2, 2)} mg/L${warningSymbol(
      r.oxygen < 4 || r.co2 > 30
    )}`,
    `**Nutrients** PO4 ${po4} · K ${round(toPpm(r.potassium, r.water), 2)} · Fe ${round(
      toPpm(r.iron, r.water),
      3
    )} ppm`,
    `**Other** waste ${round(r.waste, 2)}g · algae ${round(r.algae, 1)} · food ${round(
      r.food,
      2
    )}g`,
    '',
    `**Fish (${state.fish.length})** ${
      state.fish.length ? `avg health ${avgFishHealth}%` : '—'
    }${stressedFish ? ` · ${stressedFish} stressed` : ''}`,
    `**Plants (${state.plants.length})** ${
      state.plants.length ? `avg condition ${avgPlantCondition}%` : '—'
    }`,
  ];

  return lines.join('\n');
}

/** Fields that require ppm conversion from their underlying mass. */
const PPM_FIELDS = new Set(['nh3_ppm', 'no2_ppm', 'no3_ppm', 'po4_ppm']);

function getFieldValue(entry: HistorySnapshot, field: string): string {
  const r = entry.resources;
  switch (field) {
    case 'tick':
      return String(entry.tick);
    case 'fish_count':
      return String(entry.fish.count);
    case 'fish_avg_health':
      return String(round(entry.fish.avgHealth, 2));
    case 'plant_count':
      return String(entry.plants.count);
    case 'plant_avg_condition':
      return String(round(entry.plants.avgCondition, 2));
    case 'nh3_ppm':
      return String(round(toPpm(r.ammonia, r.water), 4));
    case 'no2_ppm':
      return String(round(toPpm(r.nitrite, r.water), 4));
    case 'no3_ppm':
      return String(round(toPpm(r.nitrate, r.water), 3));
    case 'po4_ppm':
      return String(round(toPpm(r.phosphate, r.water), 4));
    default: {
      if (field in r) {
        const v = r[field as keyof typeof r];
        if (typeof v === 'boolean') return v ? '1' : '0';
        return String(round(v as number, 4));
      }
      return '';
    }
  }
}

export interface TraceOptions {
  fields: string[];
  every?: number; // in ticks
  last?: number; // window in ticks
}

/** Render a CSV trace from a history array. */
export function renderTrace(
  history: HistorySnapshot[],
  options: TraceOptions
): string {
  const fields = options.fields.length ? options.fields : ['tick'];
  const every = options.every && options.every > 0 ? options.every : 1;
  let window = history;
  const lastWindow = options.last;
  if (lastWindow && lastWindow > 0) {
    const latest = history.at(-1)?.tick ?? 0;
    window = history.filter((h) => h.tick > latest - lastWindow);
  }
  const sampled = window.filter((h) => h.tick % every === 0);

  const header = ['tick', ...fields.filter((f) => f !== 'tick')];
  const rows = sampled.map((entry) =>
    header.map((f) => getFieldValue(entry, f)).join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export { PPM_FIELDS };
