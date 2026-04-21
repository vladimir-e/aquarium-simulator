/**
 * Smoke scenario — drives the full CLI surface end-to-end.
 *
 * Each step is the same call path that the command-line dispatcher uses so
 * that API drift in the engine breaks this in a meaningful, actionable way.
 * The scenario is deliberately short; it's a wiring check, not a calibration.
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSimulation, applyAction, tick, type SimulationState } from '../simulation/index.js';
import { DEFAULT_CONFIG } from '../simulation/config/index.js';
import { getPresetById } from '../ui/presets.js';
import { createSession, loadSession, saveSession, sessionPath } from './session.js';
import { appendSnapshot, snapshot } from './history.js';
import { renderObserve, renderTrace } from './format.js';
import { parseDuration } from './duration.js';

export interface SmokeReport {
  passed: boolean;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
}

/**
 * Build a fresh session at a given path and exercise every CLI capability.
 * Returns a report and (when requested) cleans up the temp directory.
 */
export function runSmokeScenario(options: { path?: string; cleanup?: boolean } = {}): SmokeReport {
  const dir = options.path ?? mkdtempSync(join(tmpdir(), 'sim-smoke-'));
  const path = join(dir, 'current.json');
  const steps: SmokeReport['steps'] = [];

  function step(name: string, fn: () => void): void {
    try {
      fn();
      steps.push({ name, ok: true });
    } catch (err) {
      steps.push({ name, ok: false, detail: (err as Error).message });
    }
  }

  step('new (planted preset)', () => {
    const preset = getPresetById('planted');
    if (!preset) throw new Error('planted preset missing');
    const state = createSimulation(preset.config);
    const session = createSession(state, DEFAULT_CONFIG, 'smoke-run');
    saveSession(
      { ...session, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
    if (!existsSync(path)) throw new Error('session file not written');
  });

  step('add plant', () => {
    const session = loadSession({ path });
    const { state } = applyAction(session.state, {
      type: 'addPlant',
      species: 'amazon_sword',
      initialSize: 50,
    });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
    if (state.plants.length !== 1) throw new Error('plant not added');
  });

  step('add fish (neon tetra)', () => {
    const session = loadSession({ path });
    let state: SimulationState = session.state;
    let history = session.history;
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
      history = appendSnapshot(history, snapshot(state));
    }
    saveSession({ ...session, state, history }, { path });
    if (state.fish.length !== 3) throw new Error('fish not added');
  });

  step('remove a fish', () => {
    const session = loadSession({ path });
    const target = session.state.fish[0];
    if (!target) throw new Error('no fish to remove');
    const { state } = applyAction(session.state, { type: 'removeFish', fishId: target.id });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
    if (state.fish.length !== 2) throw new Error('remove fish no-op');
  });

  step('feed action', () => {
    const session = loadSession({ path });
    const { state } = applyAction(session.state, { type: 'feed', amount: 0.5 });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
    if (state.resources.food <= 0) throw new Error('feed had no effect');
  });

  step('tick 48h', () => {
    const session = loadSession({ path });
    let state = session.state;
    let history = session.history;
    const count = parseDuration('48h');
    for (let i = 0; i < count; i++) {
      state = tick(state, session.config);
      history = appendSnapshot(history, snapshot(state));
    }
    saveSession({ ...session, state, history }, { path });
    if (state.tick < count) throw new Error('tick did not advance');
  });

  step('dose action', () => {
    const session = loadSession({ path });
    const { state } = applyAction(session.state, { type: 'dose', amountMl: 1 });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
  });

  step('waterChange action', () => {
    const session = loadSession({ path });
    const { state } = applyAction(session.state, { type: 'waterChange', amount: 0.25 });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
    if (state.resources.water !== session.state.tank.capacity) {
      throw new Error('water not refilled to capacity after change');
    }
  });

  step('topOff action', () => {
    const session = loadSession({ path });
    const { state } = applyAction(session.state, { type: 'topOff' });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
  });

  step('trimPlants action', () => {
    const session = loadSession({ path });
    // Force a plant big enough to trim so the action reports work done.
    const inflated = {
      ...session.state,
      plants: session.state.plants.map((p) => ({ ...p, size: 120 })),
    };
    const { state } = applyAction(inflated, { type: 'trimPlants', targetSize: 85 });
    saveSession(
      { ...session, state, history: appendSnapshot(session.history, snapshot(state)) },
      { path }
    );
  });

  step('scrubAlgae action (no-op when clean)', () => {
    const session = loadSession({ path });
    applyAction(session.state, { type: 'scrubAlgae', randomPercent: 0.2 });
  });

  step('config set (nitrogenCycle.maxAmmoniaOxidation)', () => {
    const session = loadSession({ path });
    const next = JSON.parse(JSON.stringify(session.config));
    const key = Object.keys(next.nitrogenCycle)[0];
    if (!key) throw new Error('no nitrogen cycle keys');
    const original = next.nitrogenCycle[key];
    next.nitrogenCycle[key] = typeof original === 'number' ? original * 1.1 : original;
    saveSession({ ...session, config: next }, { path });
    const reloaded = loadSession({ path });
    if (JSON.stringify(reloaded.config) !== JSON.stringify(next)) {
      throw new Error('config did not round-trip');
    }
  });

  step('observe renders markdown', () => {
    const session = loadSession({ path });
    const md = renderObserve(session);
    if (!md.includes('# Session:')) throw new Error('observe missing heading');
  });

  step('trace renders CSV', () => {
    const session = loadSession({ path });
    const csv = renderTrace(session.history, {
      fields: ['temperature', 'ph', 'nh3_ppm'],
      every: 24,
    });
    const [header, ...rows] = csv.split('\n');
    if (!header?.startsWith('tick')) throw new Error('trace header malformed');
    if (rows.length === 0) throw new Error('trace produced no rows');
  });

  if (options.cleanup !== false) {
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    passed: steps.every((s) => s.ok),
    steps,
  };
}

/** CLI-facing wrapper that returns a printable report. */
export function runSmoke(): string {
  const report = runSmokeScenario();
  const lines = [
    `# Smoke run — ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    ...report.steps.map(
      (s) => `${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`
    ),
  ];
  return lines.join('\n');
}

/** Re-export for tests that want to pin the default path. */
export { sessionPath };
