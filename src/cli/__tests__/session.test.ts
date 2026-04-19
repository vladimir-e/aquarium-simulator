import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSimulation } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { getPresetById } from '../../ui/presets.js';
import { createSession, loadSession, saveSession, hasSession } from '../session.js';
import { appendSnapshot, HISTORY_CAP, snapshot } from '../history.js';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sim-session-'));
  path = join(dir, 'current.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('session roundtrip', () => {
  it('creates, saves, and reloads a session', () => {
    const preset = getPresetById('bare');
    expect(preset).toBeDefined();
    const state = createSimulation(preset!.config);
    const session = createSession(state, DEFAULT_CONFIG, 'roundtrip');
    saveSession(session, { path });

    expect(hasSession(path)).toBe(true);
    const loaded = loadSession({ path });
    expect(loaded.name).toBe('roundtrip');
    expect(loaded.state.tank.capacity).toBe(state.tank.capacity);
    expect(loaded.state.tick).toBe(0);
    expect(loaded.config.nitrogenCycle).toEqual(DEFAULT_CONFIG.nitrogenCycle);
  });

  it('refuses to load a missing session', () => {
    expect(() => loadSession({ path })).toThrow(/No session found/);
  });

  it('rejects mismatched version', () => {
    const preset = getPresetById('bare')!;
    const state = createSimulation(preset.config);
    const session = createSession(state, DEFAULT_CONFIG);
    saveSession({ ...session, version: 99 }, { path });
    expect(() => loadSession({ path })).toThrow(/Unsupported session version/);
  });
});

describe('history cap', () => {
  it('drops the oldest entries beyond the cap', () => {
    const preset = getPresetById('bare')!;
    const state = createSimulation(preset.config);
    let history: ReturnType<typeof snapshot>[] = [];
    for (let t = 0; t < HISTORY_CAP + 50; t++) {
      history = appendSnapshot(history, { ...snapshot(state), tick: t });
    }
    expect(history.length).toBe(HISTORY_CAP);
    // First retained entry should be tick=50 (oldest 50 dropped).
    expect(history[0]!.tick).toBe(50);
    expect(history.at(-1)!.tick).toBe(HISTORY_CAP + 49);
  });
});
