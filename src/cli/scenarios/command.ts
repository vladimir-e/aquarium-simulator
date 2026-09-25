import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { READINGS } from './readings.js';
import { renderTable, renderTrace, toJson } from './report.js';
import { runScenario } from './run.js';
import { SETUPS, findSetup } from './setups.js';
import { applyTweak, parseTweak, TWEAK_FLAGS, type Tweak } from './tweaks.js';

export const SCENARIO_FLAGS = ['days', 'json', 'trace', 'bands', ...TWEAK_FLAGS];

export interface ScenarioArgs {
  names: string[];
  days: number;
  json: string | true | undefined;
  traceDay: number | undefined;
  bands: boolean;
  tweaks: Tweak[];
  tweakText: string[];
}

function wholeDays(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${flag} takes whole days ≥ 1, got "${raw}".`);
  return value;
}

export function parseScenarioArgs(argv: string[]): ScenarioArgs {
  const args: ScenarioArgs = {
    names: [],
    days: 90,
    json: undefined,
    traceDay: undefined,
    bands: false,
    tweaks: [],
    tweakText: [],
  };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      args.names.push(findSetup(arg).name);
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq > 0 ? arg.slice(eq + 1) : undefined;
    if (flag === 'days') args.days = wholeDays(value ?? '', flag);
    else if (flag === 'trace') args.traceDay = wholeDays(value ?? '', flag);
    else if (flag === 'json') args.json = value ?? true;
    else if (flag === 'bands') args.bands = true;
    else {
      args.tweaks.push(parseTweak(flag, value));
      args.tweakText.push(arg);
    }
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

export function scenariosCommand(argv: string[], out: (text: string) => void): void {
  const args = parseScenarioArgs(argv);
  if (args.bands) {
    out(renderBands() + '\n');
    return;
  }

  const setups = args.names.length > 0 ? args.names.map(findSetup) : SETUPS;
  const started = performance.now();
  const results = setups.map((base) => {
    const { setup, config } = args.tweaks.reduce(applyTweak, { setup: base, config: DEFAULT_CONFIG });
    const label = [base.name, ...args.tweakText].join(' ');
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
