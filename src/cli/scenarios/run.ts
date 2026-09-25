import { applyAction, tick, type Action, type SimulationState } from '../../simulation/index.js';
import { createSimulation } from '../../simulation/state.js';
import { getPh } from '../../simulation/core/carbonate.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { toFahrenheit } from '../units.js';
import { SAMPLE_HOUR, VACUUM_SHARE, dayOf, dueActions, isKeeperHourOf, rescapeTank } from './keeper.js';
import { READINGS, gradeReading, type Grade, type ReadingId } from './readings.js';
import { toConfig, toSeed, type Setup } from './setups.js';

const STANDARD_DAYS = [1, 7, 30, 90, 300];

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

export type OnRefusal = (type: Action['type'], message: string) => void;

interface RunOptions {
  days: number;
  config: TunableConfig;
  traceDay?: number;
  onRefusal?: OnRefusal;
}

interface KeepOptions {
  config: TunableConfig;
  untilTick: number;
  observe?: (state: SimulationState) => void;
  onRefusal?: OnRefusal;
}

const ROUTINE_NO_OPS: ReadonlySet<Action['type']> = new Set(['scrubAlgae', 'trimPlants', 'topOff']);

export function keepTank(setup: Setup, { config, untilTick, observe, onRefusal }: KeepOptions): SimulationState {
  let state = createSimulation(toConfig(setup), toSeed(setup), RNG_SEED);
  observe?.(state);
  while (state.tick < untilTick) {
    if (setup.rescapeOn !== undefined && isKeeperHourOf(setup.rescapeOn, state.tick)) {
      state = rescapeTank(state, config);
    }
    for (const due of dueActions(setup.schedule, state)) {
      const action = due.type === 'waterChange' ? { ...due, vacuum: setup.vacuum ?? VACUUM_SHARE } : due;
      const result = applyAction(state, action, config);
      if (result.state === state && !ROUTINE_NO_OPS.has(action.type)) onRefusal?.(action.type, result.message);
      state = result.state;
    }
    state = tick(state, config);
    observe?.(state);
  }
  return state;
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

type Readout = Record<ReadingId, number | null>;

export function runScenario(setup: Setup, { days, config, traceDay, onRefusal }: RunOptions): ScenarioResult {
  const marks = sampleDays(days);
  let start: Readout | undefined;
  const cells = Object.fromEntries(READINGS.map((r) => [r.id, [] as Cell[]])) as Record<ReadingId, Cell[]>;
  const trace: TraceRow[] = [];

  const observe = (state: SimulationState): void => {
    start ??= Object.fromEntries(READINGS.map((r) => [r.id, r.read(state)])) as Readout;
    if (dayOf(state.tick) === traceDay) {
      trace.push({
        hour: state.tick % 24,
        par: state.resources.light,
        tempF: toFahrenheit(state.resources.temperature),
        o2: state.resources.oxygen,
        co2: state.resources.co2,
        ph: getPh(state.resources),
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

  const untilTick = Math.max(tickOfDay(marks[marks.length - 1]!), (traceDay ?? 0) * 24 - 1);
  keepTank(setup, { config, untilTick, observe, onRefusal });
  return { setup, days: marks, cells, trace };
}
