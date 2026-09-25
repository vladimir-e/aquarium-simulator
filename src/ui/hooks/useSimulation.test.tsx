import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act, type RenderHookResult } from '@testing-library/react';
import { useSimulation } from './useSimulation';
import { createPresetSimulation, getPresetById, type PresetId } from '../../simulation/presets';
import { ConfigProvider, useConfig } from './useConfig';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_SETTINGS } from '../actions/verbs.js';
import { createSimulation, type SimulationState } from '../../simulation/state.js';
import {
  applyAction,
  calculateTankHeight,
  getSubstrateOrganicReserve,
  getSubstrateSurface,
  tick,
} from '../../simulation/index.js';
import { cycledColony } from '../../simulation/seed.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  PERSISTENCE_VERSION,
  STORAGE_KEY,
  type PersistedSimulation,
  type PersistedState,
} from '../persistence/types.js';
import { snapshotFromState } from '../run/index.js';

function seedSession(
  state: SimulationState,
  presetId: PresetId,
  overrides: Partial<PersistedSimulation> = {}
): void {
  const persisted: PersistedState = {
    version: PERSISTENCE_VERSION,
    simulation: {
      tick: state.tick,
      tank: state.tank,
      resources: state.resources,
      environment: state.environment,
      equipment: state.equipment,
      plants: state.plants,
      fish: state.fish,
      clutches: state.clutches,
      algae: state.algae,
      rng: state.rng,
      alertState: state.alertState,
      currentPreset: presetId,
      ...overrides,
    },
    tunableConfig: DEFAULT_CONFIG,
    ui: { units: 'metric', tunablesOpen: false, spineOpen: false, acts: { settings: DEFAULT_SETTINGS, promoted: null } },
  };
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function seedSessionWithClutch(presetId: PresetId): void {
  seedSession(createSimulation(getPresetById(presetId)!.config), presetId, {
    tick: 300,
    clutches: [{ id: 'c1', species: 'neon_tetra', eggCount: 25, laidTick: 250 }],
  });
}

function seedSessionWithHighAmmonia(): void {
  const base = createSimulation(getPresetById('bare')!.config);
  seedSession(base, 'bare', { resources: { ...base.resources, ammonia: 20 } });
}

const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <PersistenceProvider>
    <ConfigProvider>{children}</ConfigProvider>
  </PersistenceProvider>
);

const strictWrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <React.StrictMode>
    <PersistenceProvider>
      <ConfigProvider>{children}</ConfigProvider>
    </PersistenceProvider>
  </React.StrictMode>
);

const HOURS_OF_A_DAY = Array.from({ length: 24 }, (_, i) => i + 1);

describe('useSimulation', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const defaultPreset = getPresetById('planted')!;

  it('initializes simulation with default preset config', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    expect(result.current.state.tank.capacity).toBe(defaultPreset.config.tankCapacity);
    expect(result.current.state.resources.water).toBe(defaultPreset.config.tankCapacity);
    expect(result.current.state.resources.temperature).toBe(25);
    expect(result.current.state.equipment.filter.enabled).toBe(true);
    expect(result.current.state.equipment.filter.type).toBe('canister');
    expect(result.current.state.tick).toBe(0);
    expect(result.current.currentPreset).toBe('planted');
  });

  it('tick advances simulation state', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    const initialTick = result.current.state.tick;

    act(() => {
      result.current.step();
    });

    expect(result.current.state.tick).toBe(initialTick + 24);
  });

  it('changing tank size reinitializes simulation', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    act(() => {
      result.current.step();
      result.current.step();
    });

    expect(result.current.state.tick).toBe(48);

    act(() => {
      result.current.changeTankCapacity(150);
    });

    expect(result.current.state.tank.capacity).toBe(150);
    expect(result.current.state.resources.water).toBe(150);
    expect(result.current.state.tick).toBe(0);
  });

  it('swapping the substrate lays a fresh bed with a full organic reserve', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    const started = result.current.state.equipment.substrate.organicReserve;
    const full = getSubstrateOrganicReserve('aqua_soil', result.current.state.tank.capacity);
    expect(started).toBeGreaterThan(0);
    expect(started).toBeLessThan(full);

    act(() => {
      result.current.step();
    });
    const spent = result.current.state.equipment.substrate.organicReserve;
    expect(spent).toBeLessThan(started);

    act(() => {
      result.current.updateSubstrateType('aqua_soil');
    });
    expect(result.current.state.equipment.substrate.organicReserve).toBe(spent);

    act(() => {
      result.current.updateSubstrateType('gravel');
      result.current.updateSubstrateType('aqua_soil');
    });
    expect(result.current.state.equipment.substrate.organicReserve).toBe(full);
  });

  it('heater controls update simulation state', () => {
    const { result } = renderHook(() => useSimulation('betta'), { wrapper });

    expect(result.current.state.equipment.heater.enabled).toBe(true);

    act(() => {
      result.current.updateHeaterEnabled(false);
    });
    expect(result.current.state.equipment.heater.enabled).toBe(false);

    act(() => {
      result.current.updateHeaterTargetTemperature(28);
    });
    expect(result.current.state.equipment.heater.targetTemperature).toBe(28);

    act(() => {
      result.current.updateHeaterWattage(200);
    });
    expect(result.current.state.equipment.heater.wattage).toBe(200);
  });

  it('room temperature changes update simulation state', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    act(() => {
      result.current.updateRoomTemperature(25);
    });

    expect(result.current.state.environment.roomTemperature).toBe(25);
  });

  it('play/pause toggles auto-advance', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    expect(result.current.isPlaying).toBe(false);

    act(() => {
      result.current.togglePlayPause();
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.togglePlayPause();
    });

    expect(result.current.isPlaying).toBe(false);
  });

  it('stepping takes the clock, so the day you stepped to is the day you land on', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    act(() => {
      result.current.togglePlayPause();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.step();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.state.tick).toBe(24);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.state.tick).toBe(24);
  });

  it('saves and reloads mid-stream, so a session break costs the tank nothing', () => {
    const start = createSimulation(getPresetById('bare')!.config, undefined, 2026);
    seedSession(start, 'bare');

    const first = renderHook(() => useSimulation('bare'), { wrapper });
    act(() => {
      first.result.current.executeAction({ type: 'addFish', species: 'guppy' });
      first.result.current.step();
    });
    first.unmount();

    const second = renderHook(() => useSimulation('bare'), { wrapper });
    act(() => {
      second.result.current.executeAction({ type: 'addFish', species: 'guppy' });
      second.result.current.step();
    });

    let straight = start;
    for (let day = 0; day < 2; day++) {
      straight = applyAction(straight, { type: 'addFish', species: 'guppy' }).state;
      for (let hour = 0; hour < 24; hour++) straight = tick(straight, DEFAULT_CONFIG);
    }

    expect(second.result.current.state.rng).toEqual(straight.rng);
    expect(second.result.current.state.rng.counter).toBeGreaterThan(start.rng.counter);
    expect(second.result.current.state.fish).toEqual(straight.fish);
    expect(second.result.current.state.resources).toEqual(straight.resources);
  });

  it('speed changes update speed state', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    expect(result.current.speed).toBe('1h');

    act(() => {
      result.current.changeSpeed('1d');
    });

    expect(result.current.speed).toBe('1d');
  });

  describe('presets', () => {
    it('loads preset correctly', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      expect(result.current.currentPreset).toBe('betta');
      expect(result.current.state.tank.capacity).toBe(20);
      expect(result.current.state.equipment.heater.enabled).toBe(true);
      expect(result.current.state.equipment.heater.targetTemperature).toBe(26);
      expect(result.current.state.equipment.lid.type).toBe('mesh');
    });

    it('loadPreset changes configuration', () => {
      const { result } = renderHook(() => useSimulation('planted'), { wrapper });

      expect(result.current.currentPreset).toBe('planted');

      act(() => {
        result.current.loadPreset('community');
      });

      expect(result.current.currentPreset).toBe('community');
      expect(result.current.state.tank.capacity).toBe(150);
      expect(result.current.state.equipment.heater.targetTemperature).toBe(27);
    });

    it('swapping the bed under a running tank still takes that bed’s biofilm', () => {
      const { result } = renderHook(() => useSimulation('planted'), { wrapper });

      act(() => {
        for (let day = 0; day < 12; day++) result.current.step();
      });

      const before = result.current.state.resources;
      expect(before.aob).toBeGreaterThan(0);
      expect(before.nob).toBeGreaterThan(0);

      act(() => {
        result.current.updateSubstrateType('gravel');
      });

      const kept = 1 - getSubstrateSurface('aqua_soil', 40) / before.surface;
      expect(kept).toBeGreaterThan(0);
      expect(kept).toBeLessThan(1);
      expect(result.current.state.resources.aob / before.aob).toBeCloseTo(kept, 10);
      expect(result.current.state.resources.nob / before.nob).toBeCloseTo(kept, 10);
      expect(result.current.state.tick).toBe(12 * 24);
    });

    it('reset keeps equipment but resets tick and resources', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterTargetTemperature(30);
        result.current.step();
        result.current.step();
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(30);
      expect(result.current.state.tick).toBe(48);

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(30);
      expect(result.current.state.tick).toBe(0);
      expect(result.current.currentPreset).toBe('betta');
    });

    it('takes a new tank identity on a swap, and keeps it through a reset', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });
      const opened = result.current.tankId;

      act(() => result.current.step());
      act(() => result.current.reset());
      expect(result.current.tankId).toBe(opened);

      act(() => result.current.loadPreset('planted'));
      const loaded = result.current.tankId;
      expect(loaded).not.toBe(opened);

      act(() => result.current.changeTankCapacity(120));
      expect(result.current.tankId).not.toBe(loaded);
    });

    it('reset clears in-flight clutches (time-anchored)', () => {
      seedSessionWithClutch('planted');
      const { result } = renderHook(() => useSimulation(), { wrapper });
      expect(result.current.state.clutches).toHaveLength(1);

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.clutches).toHaveLength(0);
      expect(result.current.state.tick).toBe(0);
    });

    it('loads a preset as the tank that preset builds, keeping nothing of the last one', () => {
      seedSessionWithClutch('planted');
      const { result } = renderHook(() => useSimulation(), { wrapper });

      act(() => {
        result.current.executeAction({ type: 'addFish', species: 'neon_tetra' });
        result.current.executeAction({ type: 'addPlant', species: 'java_fern' });
      });
      act(() => {
        result.current.togglePlayPause();
      });

      const before = result.current.state;
      expect(before.tick).toBeGreaterThan(0);
      expect(before.fish).toHaveLength(1);
      expect(before.plants).toHaveLength(1);
      expect(before.clutches).toHaveLength(1);
      expect(result.current.isPlaying).toBe(true);

      act(() => {
        result.current.loadPreset('community');
      });

      const after = result.current.state;
      const fresh = createPresetSimulation(getPresetById('community')!, after.rng.seed);
      expect({ ...after, logs: [] }).toEqual({ ...fresh, logs: [] });
      expect(after.rng.seed).not.toBe(before.rng.seed);
      expect(result.current.currentPreset).toBe('community');

      expect(result.current.isPlaying).toBe(false);
      expect(result.current.history).toHaveLength(1);
      expect(result.current.aggregates.ticks).toBe(0);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.state.tick).toBe(0);
    });

    it('restarts the loaded preset too, drift and all', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterTargetTemperature(30);
        result.current.step();
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(30);
      expect(result.current.state.tick).toBe(24);

      act(() => {
        result.current.loadPreset('betta');
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(26);
      expect(result.current.state.tick).toBe(0);
    });

    it('starts the established presets cycled, and the bare tank empty', () => {
      for (const id of ['betta', 'planted', 'community', 'angelfish'] as const) {
        const { result, unmount } = renderHook(() => useSimulation(id), { wrapper });
        const { aob, nob } = result.current.state.resources;

        expect(aob).toBe(cycledColony(result.current.state.tank.capacity).aob);
        expect(nob).toBe(cycledColony(result.current.state.tank.capacity).nob);
        unmount();
        globalThis.localStorage.clear();
      }

      const { result } = renderHook(() => useSimulation('bare'), { wrapper });
      expect(result.current.state.resources.aob).toBe(0);
    });

    it('bare preset has no equipment enabled', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      expect(result.current.state.equipment.heater.enabled).toBe(false);
      expect(result.current.state.equipment.filter.enabled).toBe(false);
      expect(result.current.state.equipment.light.enabled).toBe(false);
      expect(result.current.state.equipment.ato.enabled).toBe(false);
      expect(result.current.state.equipment.co2Generator.enabled).toBe(false);
    });
  });

  describe('equipment updates', () => {
    it('relights the substrate when the fixture is swapped', () => {
      let lit = createPresetSimulation(getPresetById('planted')!);
      for (let i = 0; i < 9; i++) lit = tick(lit, DEFAULT_CONFIG);
      seedSession(lit, 'planted');

      const { result } = renderHook(() => useSimulation('planted'), { wrapper });
      const before = result.current.state.resources.light;
      expect(before).toBeGreaterThan(0);

      act(() => {
        result.current.updateLightPar(150);
      });

      expect(result.current.state.resources.light / before).toBeCloseTo(150 / 90, 6);
    });
  });

  describe('optics', () => {
    type Harness = {
      sim: ReturnType<typeof useSimulation>;
      config: ReturnType<typeof useConfig>;
    };

    function litTank(): RenderHookResult<Harness, unknown> {
      let lit = createPresetSimulation(getPresetById('planted')!);
      for (let i = 0; i < 9; i++) lit = tick(lit, DEFAULT_CONFIG);
      seedSession(lit, 'planted');
      return renderHook(() => ({ sim: useSimulation('planted'), config: useConfig() }), {
        wrapper,
      });
    }

    it('relights the substrate when the water is retuned, without a tick', () => {
      const { result } = litTank();
      const { par } = result.current.sim.state.equipment.light;
      const before = result.current.sim.state.resources.light;
      const tickBefore = result.current.sim.state.tick;
      expect(before).toBeGreaterThan(0);

      act(() => {
        result.current.config.setTunable(
          'optics.waterAttenuationPerCm',
          DEFAULT_CONFIG.optics.waterAttenuationPerCm * 2
        );
      });

      const after = result.current.sim.state.resources.light;
      expect(after / par).toBeCloseTo((before / par) ** 2, 10);
      expect(result.current.sim.state.tick).toBe(tickBefore);
    });

    it('opens a resized tank in the water the config describes', () => {
      const lit = createPresetSimulation(getPresetById('planted')!);
      lit.equipment.light.schedule = { startHour: 0, duration: 24 };
      seedSession(lit, 'planted');

      const { result } = renderHook(
        () => ({ sim: useSimulation('planted'), config: useConfig() }),
        { wrapper }
      );

      const tuned = DEFAULT_CONFIG.optics.waterAttenuationPerCm * 4;
      act(() => {
        result.current.config.setTunable('optics.waterAttenuationPerCm', tuned);
      });
      act(() => {
        result.current.sim.changeTankCapacity(200);
      });

      const { par } = result.current.sim.state.equipment.light;
      const surviving = Math.exp(-tuned * calculateTankHeight(200));
      expect(result.current.sim.state.resources.light).toBeCloseTo(par * surviving, 8);
    });

    it('puts the light back when the section is reset', () => {
      const { result } = litTank();
      const before = result.current.sim.state.resources.light;

      act(() => {
        result.current.config.setTunable('optics.waterAttenuationPerCm', 0.04);
      });
      expect(result.current.sim.state.resources.light).toBeLessThan(before);

      act(() => {
        result.current.config.resetSection('optics');
      });
      expect(result.current.sim.state.resources.light).toBeCloseTo(before, 10);
    });
  });

  describe('logging', () => {
    it('emits log when heater disabled', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterEnabled(false);
      });

      const logs = result.current.state.logs;
      const disabledLog = logs.find(
        (log) => log.source === 'user' && log.message === 'Heater disabled'
      );
      expect(disabledLog).toBeDefined();
    });

    it('emits log when heater target changed', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterTargetTemperature(28);
      });

      const logs = result.current.state.logs;
      const targetLog = logs.find(
        (log) =>
          log.source === 'user' &&
          log.message.includes('Heater target') &&
          log.message.includes('28°C')
      );
      expect(targetLog).toBeDefined();
    });

    it('emits log when heater wattage changed', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterWattage(200);
      });

      const logs = result.current.state.logs;
      const wattageLog = logs.find(
        (log) =>
          log.source === 'user' &&
          log.message.includes('Heater wattage') &&
          log.message.includes('200W')
      );
      expect(wattageLog).toBeDefined();
    });

    it('emits log when room temperature changed', () => {
      const { result } = renderHook(() => useSimulation(), { wrapper });

      act(() => {
        result.current.updateRoomTemperature(25);
      });

      const logs = result.current.state.logs;
      const roomTempLog = logs.find(
        (log) =>
          log.source === 'user' &&
          log.message.includes('Room temperature') &&
          log.message.includes('25°C')
      );
      expect(roomTempLog).toBeDefined();
    });

    it('emits simulation reset log when reset is called', () => {
      const { result } = renderHook(() => useSimulation(), { wrapper });

      act(() => {
        result.current.step();
        result.current.reset();
      });

      const logs = result.current.state.logs;
      const resetLog = logs.find(
        (log) =>
          log.source === 'simulation' &&
          log.message.includes('Simulation reset')
      );
      expect(resetLog).toBeDefined();
    });

    it('heater enabled log includes target and wattage', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      act(() => {
        result.current.updateHeaterEnabled(false);
      });
      act(() => {
        result.current.updateHeaterEnabled(true);
      });

      const logs = result.current.state.logs;
      const enabledLog = logs.find(
        (log) => log.source === 'user' && log.message.includes('Heater enabled')
      );
      expect(enabledLog).toBeDefined();
      expect(enabledLog!.message).toContain('target:');
      expect(enabledLog!.message).toContain('°C');
      expect(enabledLog!.message).toContain('W');
    });
  });

  describe('executeAction', () => {
    it('applies an action to a paused tank and logs it', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });
      const capacity = result.current.state.tank.capacity;

      act(() => {
        result.current.step();
      });
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.state.resources.water).toBeLessThan(capacity);

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.resources.water).toBe(capacity);
      const last = result.current.state.logs[result.current.state.logs.length - 1];
      expect(last.source).toBe('user');
      expect(last.message).toContain('Topped off water');
    });
  });

  describe('run history + aggregates', () => {
    it('seeds history with the initial snapshot', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].tick).toBe(0);
      expect(result.current.aggregates.ticks).toBe(0);
    });

    it('appends a snapshot and advances run length per step', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      act(() => {
        result.current.step();
      });

      const { history, aggregates } = result.current;
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[history.length - 1].tick).toBe(24);
      expect(aggregates.ticks).toBe(24);
    });

    it('accumulates water changed at dispatch', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      act(() => {
        result.current.executeAction({ type: 'waterChange', amount: 0.25 });
      });

      expect(result.current.aggregates.waterChangedL).toBeCloseTo(10, 5);
    });

    it('refreshes the current-tick snapshot after a paused water change', () => {
      seedSessionWithHighAmmonia();
      const { result } = renderHook(() => useSimulation(), { wrapper: strictWrapper });
      const lenBefore = result.current.history.length;
      const tickBefore = result.current.state.tick;
      const stale = result.current.history[result.current.history.length - 1];
      expect(stale.ammonia).toBeGreaterThan(0);

      act(() => {
        result.current.executeAction({ type: 'waterChange', amount: 0.5 });
      });

      const fresh = result.current.history[result.current.history.length - 1];
      expect(result.current.history.length).toBe(lenBefore);
      expect(fresh.tick).toBe(tickBefore);
      expect(fresh).toEqual(snapshotFromState(result.current.state));
      expect(fresh.ammonia).toBeLessThan(stale.ammonia);
    });

    it('resets history and aggregates with the run', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      act(() => {
        result.current.step();
        result.current.step();
        result.current.executeAction({ type: 'waterChange', amount: 0.25 });
      });

      expect(result.current.aggregates.ticks).toBe(48);
      expect(result.current.aggregates.waterChangedL).toBeGreaterThan(0);

      act(() => {
        result.current.reset();
      });

      expect(result.current.aggregates.ticks).toBe(0);
      expect(result.current.aggregates.waterChangedL).toBe(0);
      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].tick).toBe(0);
    });

    it('records every intra-step tick of a day step', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });
      const baseline = result.current.history.length;

      act(() => {
        result.current.step();
      });

      const { history, aggregates } = result.current;
      const recorded = history.slice(baseline);
      expect(recorded.map((s) => s.tick)).toEqual(HOURS_OF_A_DAY);
      expect(aggregates.ticks).toBe(24);
    });

    it('steps the same day whatever the autoplay speed is set to', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      act(() => {
        result.current.changeSpeed('6h');
      });
      act(() => {
        result.current.step();
      });
      expect(result.current.state.tick).toBe(24);

      act(() => {
        result.current.changeSpeed('1d');
      });
      act(() => {
        result.current.step();
      });
      expect(result.current.state.tick).toBe(48);
    });

    it('records each intra-step tick exactly once under StrictMode', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper: strictWrapper });
      const baseline = result.current.history.length;

      act(() => {
        result.current.step();
      });

      const recorded = result.current.history.slice(baseline);
      expect(recorded.map((s) => s.tick)).toEqual(HOURS_OF_A_DAY);
      expect(result.current.aggregates.ticks).toBe(24);
    });

    it('rebaselines history, aggregates and the transcript on a preset load', () => {
      seedSessionWithHighAmmonia();
      const { result } = renderHook(() => useSimulation(), { wrapper });

      act(() => {
        result.current.step();
      });
      const hasWarning = (): boolean =>
        result.current.state.logs.some((log) => log.severity === 'warning');
      expect(result.current.aggregates.alerts).toBe(1);
      expect(hasWarning()).toBe(true);

      act(() => {
        result.current.loadPreset('community');
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.aggregates.ticks).toBe(0);
      expect(result.current.aggregates.alerts).toBe(0);
      expect(hasWarning()).toBe(false);
      expect(result.current.state.logs.every((log) => log.tick === 0)).toBe(true);
      const logs = result.current.state.logs;
      expect(logs[logs.length - 1].message).toBe('Loaded preset: Balanced Community');
    });

    it('replaces the transcript on a reset too', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      act(() => {
        result.current.step();
        result.current.updateHeaterEnabled(true);
      });
      expect(result.current.state.logs.length).toBeGreaterThan(1);

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.logs.map((log) => log.message)).toEqual(['Simulation reset']);
    });

    it('counts a chemistry alert once per episode', () => {
      seedSessionWithHighAmmonia();
      const { result } = renderHook(() => useSimulation(), { wrapper });

      act(() => {
        result.current.step();
      });
      expect(result.current.aggregates.alerts).toBe(1);

      act(() => {
        result.current.step();
        result.current.step();
      });
      expect(result.current.aggregates.alerts).toBe(1);
    });
  });
});
