import { applyAction, tick, type SimulationState } from '../../simulation/index.js';
import { createSimulation } from '../../simulation/state.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { toFahrenheit } from '../units.js';
import { dueActions } from './keeper.js';
import { READINGS, gradeReading, type Grade, type ReadingId } from './readings.js';
import { toConfig, toSeed, type Setup } from './setups.js';

const STANDARD_DAYS = [1, 7, 30, 90, 300];

/** Mid-afternoon, lights on — when a keeper reaches for the test kit, before the day's chores. */
const SAMPLE_HOUR = 14;

const RNG_SEED = 1234;

export interface Cell {
  value: number | null;
  grade: Grade | null;
}

export interface TraceRow {
  hour: number;
  par: number;
  tempF: number;
  o2: number;
  co2: number;
  ph: number;
}

export interface ScenarioResult {
  setup: Setup;
  days: number[];
  cells: Record<ReadingId, Cell[]>;
  trace: TraceRow[];
}

interface RunOptions {
  days: number;
  config: TunableConfig;
  traceDay?: number;
}

export function sampleDays(days: number): number[] {
  const standard = STANDARD_DAYS.filter((d) => d <= days);
  return standard.includes(days) ? standard : [...standard, days];
}

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const tickOfDay = (day: number): number => (day - 1) * 24 + SAMPLE_HOUR;

const dayOf = (state: SimulationState): number => Math.floor(state.tick / 24) + 1;

export function runScenario(setup: Setup, { days, config, traceDay }: RunOptions): ScenarioResult {
  const marks = sampleDays(days);
  let state: SimulationState = createSimulation(toConfig(setup), toSeed(setup), RNG_SEED);
  const start = Object.fromEntries(READINGS.map((r) => [r.id, r.read(state)])) as Record<
    ReadingId,
    number | null
  >;
  const cells = Object.fromEntries(READINGS.map((r) => [r.id, [] as Cell[]])) as Record<ReadingId, Cell[]>;
  const trace: TraceRow[] = [];

  const observe = (): void => {
    if (dayOf(state) === traceDay) {
      trace.push({
        hour: state.tick % 24,
        par: state.resources.light,
        tempF: toFahrenheit(state.resources.temperature),
        o2: state.resources.oxygen,
        co2: state.resources.co2,
        ph: state.resources.ph,
      });
    }

    const day = marks.find((d) => tickOfDay(d) === state.tick);
    if (day === undefined) return;
    for (const reading of READINGS) {
      const raw = reading.read(state);
      const value = raw === null ? null : round(raw, reading.digits);
      const grade = gradeReading(reading, value, {
        day,
        cycled: setup.cycled,
        start: start[reading.id],
        overrides: setup.bands,
      });
      cells[reading.id].push({ value, grade });
    }
  };

  const lastTick = Math.max(tickOfDay(marks[marks.length - 1]!), (traceDay ?? 0) * 24 - 1);
  observe();
  while (state.tick < lastTick) {
    for (const action of dueActions(setup.schedule, state)) {
      state = applyAction(state, action, config).state;
    }
    state = tick(state, config);
    observe();
  }

  return { setup, days: marks, cells, trace };
}
