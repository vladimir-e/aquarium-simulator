/**
 * Decomposition tunable configuration: how fast each organic pool rots, how
 * temperature and oxygen pace it, and how fast what hangs in the water settles
 * into the bed.
 */

import { ORGANIC_POOLS, type OrganicResourceKey } from '../resources/types.js';
import type { VectorMeta } from './nutrients.js';

export function mapPools<T>(value: (pool: OrganicResourceKey) => T): Record<OrganicResourceKey, T> {
  return Object.fromEntries(ORGANIC_POOLS.map((pool) => [pool, value(pool)])) as Record<OrganicResourceKey, T>;
}

export interface DecompositionConfig {
  /** First-order rate each pool rots at, per hour, at the reference temperature in oxygenated water. */
  rate: Record<OrganicResourceKey, number>;
  q10: number;
  referenceTemp: number;
  /** Dissolved O2 (mg/L) at which the aerobic path runs at half its rate. */
  oxygenHalfSaturation: number;
  /** The anaerobic path's pace as a share of the aerobic one, in water with no oxygen. */
  anaerobicShare: number;
  /** First-order rate, per hour, food and standing waste settle into the bed in still water. */
  settlingRate: number;
  /** Tank turnovers per hour at which flow halves settling. */
  settlingHalfTurnover: number;
}

export const decompositionDefaults: DecompositionConfig = {
  rate: {
    // Uneaten flake fouls inside a day: half of it gone in about 14 h at 25 °C.
    food: 0.05,
    // Feces and soft shed tissue are labile: half gone in a day and a half.
    waste: Math.LN2 / 36,
    // Mulm is what the labile share leaves behind: a half-life near ten days,
    // the pace a fresh bag of soil's organics run down at.
    mulm: Math.LN2 / 240,
  },
  q10: 2.0,
  referenceTemp: 25.0,
  // Aerobic heterotrophs are the least oxygen-fussy organisms in the tank —
  // ASM1 carries them at 0.2 mg/L, half the value it gives autotrophs.
  oxygenHalfSaturation: 0.2,
  // Anoxic sediment mineralises detritus several times slower than oxic
  // sediment does: a fifth of the aerobic pace.
  anaerobicShare: 0.2,
  settlingRate: 0.1,
  settlingHalfTurnover: 4,
};

export interface DecompositionConfigMeta {
  key: Exclude<keyof DecompositionConfig, 'rate'>;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const rotRateMeta: VectorMeta<OrganicResourceKey>[] = [
  { key: 'food', label: 'Food rot rate', unit: '/hr at ref temp', min: 0.005, max: 0.5, step: 0.005 },
  { key: 'waste', label: 'Waste rot rate', unit: '/hr at ref temp', min: 0.002, max: 0.2, step: 0.001 },
  { key: 'mulm', label: 'Mulm rot rate', unit: '/hr at ref temp', min: 0.0002, max: 0.02, step: 0.0001 },
];

export const decompositionConfigMeta: DecompositionConfigMeta[] = [
  { key: 'q10', label: 'Q10 Temperature Coefficient', unit: '', min: 1, max: 4, step: 0.1 },
  { key: 'referenceTemp', label: 'Reference Temperature', unit: '°C', min: 15, max: 35, step: 1 },
  { key: 'oxygenHalfSaturation', label: 'Rot O2 Half-Saturation', unit: 'mg/L', min: 0.02, max: 2, step: 0.02 },
  { key: 'anaerobicShare', label: 'Anaerobic Share', unit: 'of aerobic', min: 0, max: 1, step: 0.05 },
  { key: 'settlingRate', label: 'Settling Rate', unit: '/hr', min: 0, max: 1, step: 0.01 },
  { key: 'settlingHalfTurnover', label: 'Settling Half-Turnover', unit: 'turnovers/hr', min: 0.5, max: 20, step: 0.5 },
];
