import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { READINGS } from './readings.js';
import { renderTable, renderTrace, toJson } from './report.js';
import { runScenario } from './run.js';
import { SETUPS, findSetup, type Setup } from './setups.js';
import { parseTweak, TWEAK_FLAGS, type Tweak } from './tweaks.js';

export const SCENARIO_FLAGS = ['days', 'json', 'trace', 'bands', ...TWEAK_FLAGS];

interface ScenarioArgs {
  setups: Setup[];
  days: number;
  json: string | true | undefined;
  traceDay: number | undefined;
  bands: boolean;
  tweaks: Tweak[];
}

function wholeDays(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${flag} takes whole days ≥ 1, got "${raw}".`);
  return value;
}

export function parseScenarioArgs(argv: string[]): ScenarioArgs {
  const args: ScenarioArgs = {
    setups: [],
    days: 90,
    json: undefined,
    traceDay: undefined,
    bands: false,
    tweaks: [],
  };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      const setup = findSetup(arg);
      if (args.setups.includes(setup)) throw new Error(`Setup "${arg}" is named twice.`);
      args.setups.push(setup);
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq > 0 ? arg.slice(eq + 1) : undefined;
    if (flag === 'days') args.days = wholeDays(value ?? '', flag);
    else if (flag === 'trace') args.traceDay = wholeDays(value ?? '', flag);
    else if (flag === 'json') {
      if (value === '') throw new Error('--json= needs a file name; bare --json prints to stdout.');
      args.json = value ?? true;
    } else if (flag === 'bands') args.bands = true;
    else args.tweaks.push(parseTweak(flag, value));
  }
  return args;
}

function renderBands(): string {
  return READINGS.map((r) => {
    const range = ([lo, hi]: readonly [number, number]): string => `${lo}–${hi === Infinity ? '∞' : hi}`;
    const of = r.ofStart ? ' (× start)' : '';
    return `${r.label.padEnd(14)} G ${range(r.band.green)}  A ${range(r.band.amber)}${of}  — ${r.band.why}`;
  }).join('\n');
}

export function scenariosCommand(argv: string[]): void {
  const out = (text: string): void => {
    process.stdout.write(text);
  };
  const args = parseScenarioArgs(argv);
  if (args.bands) {
    out(renderBands() + '\n');
    return;
  }

  const started = performance.now();
  const results = (args.setups.length > 0 ? args.setups : SETUPS).map((base) => {
    const { setup, config } = args.tweaks.reduce((tank, tweak) => tweak.apply(tank), {
      setup: base,
      config: DEFAULT_CONFIG,
    });
    const label = [base.name, ...args.tweaks.map((t) => t.text)].join(' ');
    return { label, result: runScenario(setup, { days: args.days, config, traceDay: args.traceDay }) };
  });
  const seconds = (performance.now() - started) / 1000;

  if (args.json === true) {
    out(toJson(results));
    return;
  }
  if (typeof args.json === 'string') writeFileSync(args.json, toJson(results), 'utf8');

  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  for (const { label, result } of results) {
    out(renderTable(result, { color, label }) + '\n\n');
    if (args.traceDay !== undefined) out(renderTrace(result.trace, args.traceDay) + '\n\n');
  }
  out(`${results.length} setup${results.length === 1 ? '' : 's'} × ${args.days} d in ${seconds.toFixed(1)} s\n`);
}
