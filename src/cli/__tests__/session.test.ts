import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSimulation, tick } from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { getPresetById } from '../../simulation/presets.js';
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

  it('reloads a seeded tank whole — colony, roster and scape', () => {
    const community = getPresetById('community')!;
    const state = createSimulation(community.config, {
      ...community.seed,
      fish: [{ species: 'neon_tetra', count: 3, sex: 'female', age: 500 }],
      plants: [{ species: 'java_fern', count: 2, size: 80 }],
    });
    saveSession(createSession(state, DEFAULT_CONFIG, 'seeded'), { path });

    const loaded = loadSession({ path }).state;
    expect(state.resources.aob).toBeGreaterThan(0);
    expect(loaded.resources.aob).toBe(state.resources.aob);
    expect(loaded.resources.nob).toBe(state.resources.nob);
    expect(loaded.fish).toEqual(state.fish);
    expect(loaded.fish.map((f) => f.sex)).toEqual(['female', 'female', 'female']);
    expect(loaded.plants.map((p) => p.size)).toEqual([80, 80]);
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

  it('rejects a stale v1 session (pre-breeding shape) instead of crashing', () => {
    // A session written from `main` is version 1 but lacks `Fish.stage` /
    // `state.clutches` and the saturating surplus bank. The version gate
    // must reject it cleanly rather than let it load and crash downstream.
    const preset = getPresetById('bare')!;
    const state = createSimulation(preset.config);
    const session = createSession(state, DEFAULT_CONFIG);
    saveSession({ ...session, version: 1 }, { path });
    expect(() => loadSession({ path })).toThrow(/Unsupported session version/);
  });

  it('rejects a stale v2 session, whose flow severity is denominated in L/h', () => {
    // v2 parses cleanly under v3 — the shape did not move, the unit did.
    // A v2 config states `flowStressSeverity` in %/h per L/h, so a session
    // that loaded would charge a thirtieth of every flow stressor. The
    // version gate is the only thing that can notice.
    const staleSeverity = 0.01;
    expect(DEFAULT_CONFIG.livestock.flowStressSeverity).not.toBe(staleSeverity);

    const preset = getPresetById('bare')!;
    const state = createSimulation(preset.config);
    const session = createSession(state, {
      ...DEFAULT_CONFIG,
      livestock: { ...DEFAULT_CONFIG.livestock, flowStressSeverity: staleSeverity },
    });
    saveSession({ ...session, version: 2 }, { path });

    expect(() => loadSession({ path })).toThrow(/Unsupported session version/);
  });

  it('rejects a stale v4 session, written before light became PAR', () => {
    // A v4 session parses and runs — through the night. It carries no
    // `config.optics`, and the substrate-PAR calculation returns early while
    // surface PAR is zero, so the missing attenuation coefficient is not read
    // until the photoperiod opens. A session that loaded would die at 08:00.
    const preParConfig: Record<string, unknown> = { ...DEFAULT_CONFIG };
    delete preParConfig.optics;
    const config = preParConfig as unknown as TunableConfig;

    const lit = createSimulation({
      tankCapacity: 40,
      light: { enabled: true, par: 50, schedule: { startHour: 0, duration: 24 } },
    });
    expect(() => tick(lit, config)).toThrow(/waterAttenuationPerCm/);

    saveSession({ ...createSession(lit, config), version: 4 }, { path });
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
