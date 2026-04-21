/**
 * Session persistence for the calibration CLI.
 *
 * A session is a frozen snapshot of an ongoing simulation: the engine config,
 * the current `SimulationState`, and a rolling history of per-tick snapshots.
 * It is stored as JSON at `.simstate/current.json` (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SimulationState } from '../simulation/index.js';
import { type TunableConfig, DEFAULT_CONFIG } from '../simulation/config/index.js';
import type { HistorySnapshot } from './history.js';

export const SESSION_VERSION = 1;
export const DEFAULT_SESSION_PATH = resolve(process.cwd(), '.simstate/current.json');

export interface Session {
  version: number;
  createdAt: string;
  name?: string;
  config: TunableConfig;
  state: SimulationState;
  history: HistorySnapshot[];
}

export interface LoadOptions {
  path?: string;
}

export function sessionPath(path?: string): string {
  return path ?? DEFAULT_SESSION_PATH;
}

export function hasSession(path?: string): boolean {
  return existsSync(sessionPath(path));
}

export function loadSession(options: LoadOptions = {}): Session {
  const file = sessionPath(options.path);
  if (!existsSync(file)) {
    throw new Error(
      `No session found at ${file}. Run "sim new --preset=<id>" first.`
    );
  }
  const raw = readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as Session;
  if (parsed.version !== SESSION_VERSION) {
    throw new Error(
      `Unsupported session version ${parsed.version} (expected ${SESSION_VERSION}).`
    );
  }
  return parsed;
}

export function saveSession(session: Session, options: LoadOptions = {}): void {
  const file = sessionPath(options.path);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
  renameSync(tmp, file);
}

export function createSession(
  state: SimulationState,
  config: TunableConfig = DEFAULT_CONFIG,
  name?: string
): Session {
  return {
    version: SESSION_VERSION,
    createdAt: new Date().toISOString(),
    name,
    config,
    state,
    history: [],
  };
}
