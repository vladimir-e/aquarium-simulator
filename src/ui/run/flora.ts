/**
 * Flora & Scape derivations for the Run card: plant/algae status words, nutrient
 * band readings, scape summary, and the trim/dose option data. Pure — the card
 * renders these and wires the actions.
 */

import {
  getDosePreview,
  getPlantsToTrimCount,
  type HardscapeItem,
  type HardscapeType,
  type Resources,
  type SimulationState,
  type SubstrateType,
} from '../../simulation/index.js';
import {
  getPpm,
  IronResource,
  NitrateResource,
  PhosphateResource,
  PotassiumResource,
} from '../../simulation/resources/index.js';
import type { Status } from './status.js';

const TRIM_TARGETS = [50, 85, 100];
const DOSE_PRESETS = [1, 2, 4];

const SUBSTRATE_NAME: Record<SubstrateType, string> = {
  none: 'Bare',
  sand: 'Sand',
  gravel: 'Gravel',
  aqua_soil: 'Aqua Soil',
};

const HARDSCAPE_SHORT: Record<HardscapeType, string> = {
  neutral_rock: 'rock',
  calcite_rock: 'calcite',
  driftwood: 'driftwood',
  plastic_decoration: 'decor',
};

export function conditionStatus(condition: number): Status {
  return condition < 30 ? 'alert' : condition < 60 ? 'warn' : 'ok';
}

export function conditionWord(condition: number): string {
  if (condition < 10) return 'dying';
  if (condition < 30) return 'struggling';
  if (condition < 60) return 'fair';
  if (condition < 80) return 'good';
  return 'thriving';
}

// Low algae mass is good for the player, so the colours run green → coral as it climbs.
export function algaeStatus(mass: number): Status {
  return mass < 30 ? 'ok' : mass < 60 ? 'warn' : 'alert';
}

export function algaeWord(mass: number): string {
  if (mass < 30) return 'suppressed';
  if (mass < 60) return 'active';
  if (mass < 80) return 'spreading';
  return 'booming';
}

export type NutrientState = 'depleted' | 'low' | 'ok' | 'high' | 'veryHigh';

export function nutrientState(ppm: number, min: number, max: number): NutrientState {
  if (ppm <= 0.001) return 'depleted';
  if (ppm < min) return 'low';
  if (ppm <= max) return 'ok';
  if (ppm <= max * 2) return 'high';
  return 'veryHigh';
}

export interface NutrientReading {
  label: string;
  ppm: number;
  state: NutrientState;
}

export function nutrientReadings(resources: Resources, water: number): NutrientReading[] {
  return [
    { label: 'NO₃', ppm: getPpm(resources.nitrate, water), min: NitrateResource.safeRange?.min ?? 5, max: NitrateResource.safeRange?.max ?? 20 },
    { label: 'PO₄', ppm: getPpm(resources.phosphate, water), min: 0.5, max: PhosphateResource.safeRange?.max ?? 2 },
    { label: 'K', ppm: getPpm(resources.potassium, water), min: 5, max: PotassiumResource.safeRange?.max ?? 20 },
    { label: 'Fe', ppm: getPpm(resources.iron, water), min: 0.1, max: IronResource.safeRange?.max ?? 0.5 },
  ].map(({ label, ppm, min, max }) => ({ label, ppm, state: nutrientState(ppm, min, max) }));
}

export function allNutrientsDepleted(readings: NutrientReading[]): boolean {
  return readings.every((r) => r.state === 'depleted');
}

export function hardscapeSummary(items: HardscapeItem[]): string {
  const counts = new Map<HardscapeType, number>();
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) => (n > 1 ? `${HARDSCAPE_SHORT[type]} ×${n}` : HARDSCAPE_SHORT[type]))
    .join(' + ');
}

export function scapeSummary(substrate: SubstrateType, items: HardscapeItem[]): string {
  return items.length ? `${SUBSTRATE_NAME[substrate]} + ${hardscapeSummary(items)}` : SUBSTRATE_NAME[substrate];
}

export interface TrimTarget {
  target: number;
  count: number;
  disabled: boolean;
}

export function trimTargets(state: SimulationState): TrimTarget[] {
  return TRIM_TARGETS.map((target) => {
    const count = getPlantsToTrimCount(state, target);
    return { target, count, disabled: count === 0 };
  });
}

export interface DosePreset {
  ml: number;
  nitratePpm: number;
}

export function dosePresets(water: number): DosePreset[] {
  return DOSE_PRESETS.map((ml) => ({ ml, nitratePpm: getDosePreview(ml, water).nitratePpm }));
}
