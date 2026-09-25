import type { SimulationState } from '../../simulation/state.js';
import { unionizedAmmoniaFraction } from '../../simulation/systems/nitrogen-cycle.js';
import { getDgh, getDkh, getPpm } from '../../simulation/resources/helpers.js';
import { getPh } from '../../simulation/core/carbonate.js';
import { toFahrenheit } from '../units.js';

export interface Band {
  green: readonly [number, number];
  amber: readonly [number, number];
  why: string;
}

export type Grade = 'G' | 'A' | 'R';

export interface Reading<Id extends string = string> {
  id: Id;
  label: string;
  unit: string;
  digits: number;
  read: (state: SimulationState) => number | null;
  band: Band;
  /** Unbanded on an uncycled start until the cycle has had its month. */
  cycle?: boolean;
  /** Banded as a share of the tank's starting value. */
  ofStart?: boolean;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const ANY = Infinity;

const DEFINITIONS = [
  {
    id: 'temp',
    label: 'temp',
    unit: '°F',
    digits: 1,
    read: (s): number => toFahrenheit(s.resources.temperature),
    band: { green: [74, 82], amber: [70, 86], why: 'tropical community fish live at 74–82 °F' },
  },
  {
    id: 'nh3',
    label: 'NH₃ free',
    unit: 'ppm',
    digits: 3,
    read: (s): number =>
      getPpm(s.resources.ammonia, s.resources.water) *
      unionizedAmmoniaFraction(getPh(s.resources), s.resources.temperature),
    band: { green: [0, 0.02], amber: [0, 0.05], why: '0.02 ppm free NH₃ is the long-term safe ceiling' },
    cycle: true,
  },
  {
    id: 'tan',
    label: 'NH₃+NH₄ total',
    unit: 'ppm',
    digits: 2,
    read: (s): number => getPpm(s.resources.ammonia, s.resources.water),
    band: { green: [0, 0.25], amber: [0, 1], why: 'a cycled tank tests 0 on a hobby kit; 0.25 is the first colour step' },
    cycle: true,
  },
  {
    id: 'no2',
    label: 'NO₂',
    unit: 'ppm',
    digits: 2,
    read: (s): number => getPpm(s.resources.nitrite, s.resources.water),
    band: { green: [0, 0.25], amber: [0, 1], why: 'a cycled tank tests 0; above 1 ppm fish show nitrite stress' },
    cycle: true,
  },
  {
    id: 'no3',
    label: 'NO₃',
    unit: 'ppm',
    digits: 1,
    read: (s): number => getPpm(s.resources.nitrate, s.resources.water),
    band: { green: [0, 40], amber: [0, 80], why: 'weekly changes keep a stocked tank under ~40 ppm' },
  },
  {
    id: 'po4',
    label: 'PO₄',
    unit: 'ppm',
    digits: 2,
    read: (s): number => getPpm(s.resources.phosphate, s.resources.water),
    band: { green: [0, 3], amber: [0, 6], why: 'fish food and dosing hold 0.5–3 ppm; more is overfeeding' },
  },
  {
    id: 'o2',
    label: 'O₂',
    unit: 'mg/L',
    digits: 1,
    read: (s): number => s.resources.oxygen,
    band: { green: [6, 12], amber: [4, 16], why: 'warm water saturates near 8 mg/L; fish struggle under 4' },
  },
  {
    id: 'co2',
    label: 'CO₂',
    unit: 'mg/L',
    digits: 1,
    read: (s): number => s.resources.co2,
    band: { green: [1, 30], amber: [0, 40], why: 'air-equilibrated ~3, injected tanks aim 20–30, fish gasp past ~35' },
  },
  {
    id: 'ph',
    label: 'pH',
    unit: '',
    digits: 2,
    read: (s): number => getPh(s.resources),
    band: { green: [6, 8], amber: [5.5, 8.5], why: 'community fish are kept anywhere from 6 to 8' },
  },
  {
    id: 'kh',
    label: 'KH',
    unit: 'dKH',
    digits: 1,
    read: (s): number => getDkh(s.resources.kh, s.resources.water),
    band: { green: [1, 12], amber: [0.3, 18], why: 'soft soil tanks sit near 1, hard tap near 12; a crash to 0 lets pH fall' },
  },
  {
    id: 'gh',
    label: 'GH',
    unit: 'dGH',
    digits: 1,
    read: (s): number => getDgh(s.resources.gh, s.resources.water),
    band: { green: [2, 18], amber: [1, 25], why: 'community fish are kept from ~3 to 15; soft-water species go lower, livebearers higher' },
  },
  {
    id: 'plants',
    label: 'plants',
    unit: '#',
    digits: 0,
    read: (s): number => s.plants.length,
    band: { green: [0.9, ANY], amber: [0.5, ANY], why: 'a maintained tank loses the odd stem, not half its plants' },
    ofStart: true,
  },
  {
    id: 'plant_size',
    label: 'plant size Σ',
    unit: '%',
    digits: 0,
    read: (s): number => s.plants.reduce((sum, p) => sum + p.size, 0),
    band: { green: [0.8, ANY], amber: [0.4, ANY], why: 'plants hold or grow under care; melting back by half is a problem' },
    ofStart: true,
  },
  {
    id: 'plant_cond',
    label: 'plant cond',
    unit: '%',
    digits: 0,
    read: (s): number | null => mean(s.plants.map((p) => p.condition)),
    band: { green: [60, 100], amber: [30, 100], why: 'healthy plants look healthy; under 30 they are melting' },
  },
  {
    id: 'fish',
    label: 'fish',
    unit: '#',
    digits: 0,
    read: (s): number => s.fish.length,
    band: { green: [0.9, ANY], amber: [0.7, ANY], why: 'the odd loss in months is normal; a third gone is not' },
    ofStart: true,
  },
  {
    id: 'fish_health',
    label: 'fish health',
    unit: '%',
    digits: 0,
    read: (s): number | null => mean(s.fish.map((f) => f.health)),
    band: { green: [70, 100], amber: [40, 100], why: 'fish in a maintained tank look healthy' },
  },
  {
    id: 'algae',
    label: 'algae',
    unit: '/100',
    digits: 0,
    read: (s): number => s.algae.mass,
    band: { green: [0, 30], amber: [0, 60], why: 'some film is normal between scrapes; glass going green is not' },
  },
] as const satisfies readonly Reading[];

export type ReadingId = (typeof DEFINITIONS)[number]['id'];

export const READINGS: readonly Reading<ReadingId>[] = DEFINITIONS;

export type BandOverrides = Partial<Record<ReadingId, Band>>;

const UNCYCLED_GRACE_DAYS = 30;

const within = (value: number, [lo, hi]: readonly [number, number]): boolean =>
  value >= lo && value <= hi;

export function classify(value: number, band: Band): Grade {
  if (within(value, band.green)) return 'G';
  if (within(value, band.amber)) return 'A';
  return 'R';
}

interface GradeContext {
  day: number;
  cycled: boolean;
  start: number | null;
  overrides?: BandOverrides;
}

export function gradeReading(
  reading: Reading<ReadingId>,
  value: number | null,
  { day, cycled, start, overrides }: GradeContext
): Grade | null {
  if (value === null) return null;
  if (reading.cycle && !cycled && day < UNCYCLED_GRACE_DAYS) return null;
  const band = overrides?.[reading.id] ?? reading.band;
  if (!reading.ofStart) return classify(value, band);
  return start === null || start <= 0 ? null : classify(value / start, band);
}
