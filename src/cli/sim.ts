#!/usr/bin/env -S npx tsx
/**
 * Calibration CLI entry point.
 *
 * Stateful command dispatcher: loads the session from `.simstate/current.json`
 * (or creates one with `sim new`), runs the requested subcommand against the
 * engine, persists the updated session, and prints the result.
 */

import {
  tick,
  applyAction,
  createSimulation,
  type Action,
  type SimulationState,
} from '../simulation/index.js';
import {
  DEFAULT_CONFIG,
  type TunableConfig,
} from '../simulation/config/index.js';
import { PRESETS, getPresetById, type PresetId } from '../ui/presets.js';
import {
  loadSession,
  saveSession,
  createSession,
  type Session,
} from './session.js';
import { parseDuration } from './duration.js';
import { appendSnapshot, snapshot } from './history.js';
import { renderObserve, renderTrace } from './format.js';
import { runSmoke } from './smoke.js';

function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = 'true';
      }
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

function gallonsToLiters(gal: number): number {
  return gal * 3.785;
}

function buildConfigFromPreset(
  presetId: PresetId,
  overrides: { capacity?: number }
): ReturnType<typeof getPresetById> {
  const preset = getPresetById(presetId);
  if (!preset) {
    const ids = PRESETS.map((p) => p.id).join(', ');
    throw new Error(`Unknown preset "${presetId}". Known: ${ids}`);
  }
  if (overrides.capacity !== undefined) {
    return {
      ...preset,
      config: { ...preset.config, tankCapacity: overrides.capacity },
    };
  }
  return preset;
}

function advanceTicks(session: Session, count: number): Session {
  let state: SimulationState = session.state;
  let history = session.history;
  // Always record the starting snapshot if history is empty.
  if (history.length === 0) {
    history = appendSnapshot(history, snapshot(state));
  }
  for (let i = 0; i < count; i++) {
    state = tick(state, session.config);
    history = appendSnapshot(history, snapshot(state));
  }
  return { ...session, state, history };
}

function applyAndRecord(session: Session, action: Action): { session: Session; message: string } {
  const { state, message } = applyAction(session.state, action);
  let history = session.history;
  // Replace the latest snapshot (same tick) so observe reflects the action.
  if (history.length > 0 && history[history.length - 1]!.tick === state.tick) {
    history = history.slice(0, -1);
  }
  history = appendSnapshot(history, snapshot(state));
  return { session: { ...session, state, history }, message };
}

function getByPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = cur[key];
    if (next === null || typeof next !== 'object') {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

function coerceValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;
  // Try JSON for arrays/objects
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to string
    }
  }
  return raw;
}

/** Build an Action from `action <type> [args...]`. Throws on invalid input. */
function buildAction(type: string, args: string[]): Action {
  switch (type) {
    case 'feed': {
      const amount = Number(args[0] ?? '1');
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('feed requires a positive amount in grams.');
      }
      return { type: 'feed', amount };
    }
    case 'topOff': {
      return { type: 'topOff' };
    }
    case 'waterChange': {
      let frac = Number(args[0] ?? '0.25');
      if (!Number.isFinite(frac) || frac <= 0) {
        throw new Error('waterChange requires a fraction or percentage.');
      }
      if (frac > 1) frac = frac / 100;
      // Snap to nearest allowed discrete step.
      const choices: Array<0.1 | 0.25 | 0.5 | 0.9> = [0.1, 0.25, 0.5, 0.9];
      const snapped = choices.reduce((best, c) =>
        Math.abs(c - frac) < Math.abs(best - frac) ? c : best
      );
      return { type: 'waterChange', amount: snapped };
    }
    case 'dose': {
      // Accept either `dose <ml>` or `dose <name> <ml>` for convenience.
      const ml = args.length > 1 ? Number(args[1]) : Number(args[0] ?? '1');
      if (!Number.isFinite(ml) || ml <= 0) {
        throw new Error('dose requires a positive ml amount.');
      }
      return { type: 'dose', amountMl: ml };
    }
    case 'scrubAlgae': {
      const raw = args[0];
      if (!raw) return { type: 'scrubAlgae' };
      let pct = Number(raw);
      if (!Number.isFinite(pct) || pct <= 0) {
        throw new Error('scrubAlgae percent must be a positive number.');
      }
      if (pct > 1) pct = pct / 100;
      pct = Math.min(0.3, Math.max(0.1, pct));
      return { type: 'scrubAlgae', randomPercent: pct };
    }
    case 'trimPlants': {
      const target = Number(args[0] ?? '85');
      if (target !== 50 && target !== 85 && target !== 100) {
        throw new Error('trimPlants target must be 50, 85, or 100.');
      }
      return { type: 'trimPlants', targetSize: target };
    }
    default:
      throw new Error(`Unknown action type "${type}".`);
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      'sim — calibration CLI for the aquarium simulator',
      '',
      'Commands:',
      '  new --preset=<id> [--tank-gal=<n>|--tank-liters=<n>] [--name=<label>]',
      '  add fish --species=<id> --count=<n>',
      '  add plant --species=<id> [--size=<0-1>]',
      '  remove fish <id>',
      '  tick <duration>           (e.g. 5d, 48h, 1)',
      '  observe',
      '  trace --fields=<csv> [--last=<duration>] [--every=<duration>]',
      '  config get [<dotted.path>]',
      '  config set <dotted.path> <value>',
      '  action <type> [args...]   (feed 2.5, waterChange 40, dose 1, topOff,',
      '                             scrubAlgae 20, trimPlants 85)',
      '  smoke',
      '',
      'Session persists at .simstate/current.json.',
    ].join('\n') + '\n'
  );
}

function cmdNew(flags: Record<string, string>): void {
  const presetId = (flags.preset as PresetId | undefined) ?? 'planted';
  let capacity: number | undefined;
  if (flags['tank-gal']) {
    capacity = gallonsToLiters(Number(flags['tank-gal']));
  } else if (flags['tank-liters']) {
    capacity = Number(flags['tank-liters']);
  }
  const preset = buildConfigFromPreset(presetId, { capacity });
  if (!preset) throw new Error(`Preset "${presetId}" not found.`);
  const state = createSimulation(preset.config);
  const session = createSession(state, DEFAULT_CONFIG, flags.name ?? preset.name);
  const recorded: Session = { ...session, history: appendSnapshot(session.history, snapshot(state)) };
  saveSession(recorded);
  process.stdout.write(
    `Created session "${recorded.name}" (preset: ${presetId}, ${state.tank.capacity}L).\n`
  );
}

function cmdAdd(sub: string, flags: Record<string, string>): void {
  const session = loadSession();
  if (sub === 'fish') {
    const species = flags.species;
    if (!species) throw new Error('add fish requires --species=<id>.');
    const count = Number(flags.count ?? '1');
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error('add fish count must be a positive integer.');
    }
    let working = session;
    let lastMsg = '';
    for (let i = 0; i < count; i++) {
      const res = applyAndRecord(working, {
        type: 'addFish',
        species: species as Action extends { type: 'addFish'; species: infer S } ? S : never,
      } as Action);
      working = res.session;
      lastMsg = res.message;
    }
    saveSession(working);
    process.stdout.write(`Added ${count} ${species}. ${lastMsg}\n`);
    return;
  }
  if (sub === 'plant') {
    const species = flags.species;
    if (!species) throw new Error('add plant requires --species=<id>.');
    const sizeFlag = flags.size !== undefined ? Number(flags.size) : undefined;
    const initialSize =
      sizeFlag !== undefined ? (sizeFlag <= 1 ? sizeFlag * 100 : sizeFlag) : undefined;
    const res = applyAndRecord(session, {
      type: 'addPlant',
      species: species as Action extends { type: 'addPlant'; species: infer S } ? S : never,
      initialSize,
    } as Action);
    saveSession(res.session);
    process.stdout.write(`${res.message}\n`);
    return;
  }
  throw new Error(`Unknown add target "${sub}". Expected "fish" or "plant".`);
}

function cmdRemove(sub: string, id: string | undefined): void {
  if (!id) throw new Error(`remove ${sub} requires an id.`);
  const session = loadSession();
  if (sub === 'fish') {
    const res = applyAndRecord(session, { type: 'removeFish', fishId: id });
    saveSession(res.session);
    process.stdout.write(`${res.message}\n`);
    return;
  }
  if (sub === 'plant') {
    const res = applyAndRecord(session, { type: 'removePlant', plantId: id });
    saveSession(res.session);
    process.stdout.write(`${res.message}\n`);
    return;
  }
  throw new Error(`Unknown remove target "${sub}". Expected "fish" or "plant".`);
}

function cmdTick(duration: string | undefined): void {
  if (!duration) throw new Error('tick requires a duration (e.g. 5d, 48h, 1).');
  const count = parseDuration(duration);
  const session = loadSession();
  const next = advanceTicks(session, count);
  saveSession(next);
  process.stdout.write(
    `Advanced ${count} tick${count === 1 ? '' : 's'}. Now at tick ${next.state.tick}.\n`
  );
}

function cmdObserve(): void {
  const session = loadSession();
  process.stdout.write(renderObserve(session) + '\n');
}

function cmdTrace(flags: Record<string, string>): void {
  const session = loadSession();
  const fields = (flags.fields ?? 'temperature,ph,nh3_ppm,no2_ppm,no3_ppm')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  const every = flags.every ? parseDuration(flags.every) : 24;
  const last = flags.last ? parseDuration(flags.last) : undefined;
  process.stdout.write(renderTrace(session.history, { fields, every, last }) + '\n');
}

function cmdConfigGet(path: string | undefined): void {
  const session = loadSession();
  if (!path) {
    process.stdout.write(JSON.stringify(session.config, null, 2) + '\n');
    return;
  }
  const value = getByPath(session.config, path.split('.'));
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function cmdConfigSet(path: string | undefined, rawValue: string | undefined): void {
  if (!path || rawValue === undefined) {
    throw new Error('config set requires <dotted.path> <value>.');
  }
  const session = loadSession();
  const next: TunableConfig = JSON.parse(JSON.stringify(session.config));
  setByPath(next as unknown as Record<string, unknown>, path.split('.'), coerceValue(rawValue));
  saveSession({ ...session, config: next });
  process.stdout.write(`Set ${path} = ${rawValue}\n`);
}

function cmdAction(type: string | undefined, args: string[]): void {
  if (!type) throw new Error('action requires a type.');
  const session = loadSession();
  const action = buildAction(type, args);
  const res = applyAndRecord(session, action);
  saveSession(res.session);
  process.stdout.write(`${res.message}\n`);
}

function cmdSmoke(): void {
  const report = runSmoke();
  process.stdout.write(report + '\n');
}

export function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  const { flags, rest: positional } = parseFlags(rest);
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'new':
      cmdNew(flags);
      return;
    case 'add':
      cmdAdd(positional[0] ?? '', flags);
      return;
    case 'remove':
      cmdRemove(positional[0] ?? '', positional[1]);
      return;
    case 'tick':
      cmdTick(positional[0]);
      return;
    case 'observe':
      cmdObserve();
      return;
    case 'trace':
      cmdTrace(flags);
      return;
    case 'config': {
      const sub = positional[0];
      if (sub === 'get') {
        cmdConfigGet(positional[1]);
        return;
      }
      if (sub === 'set') {
        cmdConfigSet(positional[1], positional.slice(2).join(' ') || undefined);
        return;
      }
      throw new Error('config requires "get" or "set".');
    }
    case 'action':
      cmdAction(positional[0], positional.slice(1));
      return;
    case 'smoke':
      cmdSmoke();
      return;
    default:
      throw new Error(`Unknown command "${cmd}". Run "sim help" for usage.`);
  }
}

// Entry when executed directly via tsx.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }
}
