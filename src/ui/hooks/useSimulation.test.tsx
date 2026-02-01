import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';
import { getPresetById } from '../presets';
import { ConfigProvider } from './useConfig';
import { PersistenceProvider } from '../persistence';

// Wrapper with providers for testing hooks that depend on them
const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <PersistenceProvider>
    <ConfigProvider>{children}</ConfigProvider>
  </PersistenceProvider>
);

describe('useSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // The default preset is 'planted' which has a 40L tank
  const defaultPreset = getPresetById('planted')!;

  it('initializes simulation with default preset config', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    expect(result.current.state.tank.capacity).toBe(defaultPreset.config.tankCapacity);
    expect(result.current.state.resources.water).toBe(defaultPreset.config.tankCapacity);
    expect(result.current.state.resources.temperature).toBe(25); // Default temp
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

    // Default speed is '1hr' which has a multiplier of 1
    expect(result.current.state.tick).toBe(initialTick + 1);
  });

  it('changing tank size reinitializes simulation', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    // Advance tick to verify it resets
    act(() => {
      result.current.step();
      result.current.step();
    });

    // Each step advances by 1 tick (default speed multiplier)
    expect(result.current.state.tick).toBe(2);

    // Change tank size
    act(() => {
      result.current.changeTankCapacity(150);
    });

    expect(result.current.state.tank.capacity).toBe(150);
    expect(result.current.state.resources.water).toBe(150);
    expect(result.current.state.tick).toBe(0); // Should reset
  });

  it('heater controls update simulation state', () => {
    // Use betta preset which has heater enabled
    const { result } = renderHook(() => useSimulation('betta'), { wrapper });

    expect(result.current.state.equipment.heater.enabled).toBe(true);

    // Update heater enabled
    act(() => {
      result.current.updateHeaterEnabled(false);
    });
    expect(result.current.state.equipment.heater.enabled).toBe(false);

    // Update target temperature
    act(() => {
      result.current.updateHeaterTargetTemperature(28);
    });
    expect(result.current.state.equipment.heater.targetTemperature).toBe(28);

    // Update wattage
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

  it('speed changes update speed state', () => {
    const { result } = renderHook(() => useSimulation(), { wrapper });

    expect(result.current.speed).toBe('1hr');

    act(() => {
      result.current.changeSpeed('1day');
    });

    expect(result.current.speed).toBe('1day');
  });

  describe('presets', () => {
    it('loads preset correctly', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      expect(result.current.currentPreset).toBe('betta');
      expect(result.current.state.tank.capacity).toBe(20); // 5 gal
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
      expect(result.current.state.tank.capacity).toBe(150); // 40 gal
      expect(result.current.state.equipment.heater.targetTemperature).toBe(27);
    });

    it('reset reverts to current preset', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      // Modify some settings
      act(() => {
        result.current.updateHeaterTargetTemperature(30);
        result.current.step();
        result.current.step();
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(30);
      expect(result.current.state.tick).toBe(2);

      // Reset should restore preset defaults
      act(() => {
        result.current.reset();
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(26); // Betta preset default
      expect(result.current.state.tick).toBe(0);
      expect(result.current.currentPreset).toBe('betta');
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

  describe('logging', () => {
    it('emits log when heater enabled', () => {
      // Use betta preset which has heater
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
    });

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
          log.message.includes('Reset to preset')
      );
      expect(resetLog).toBeDefined();
    });

    it('logs accumulate across multiple ticks', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });
      const initialLogCount = result.current.state.logs.length;

      act(() => {
        result.current.updateHeaterEnabled(false);
        result.current.updateRoomTemperature(20);
      });

      // Should have initial log + 2 new logs
      expect(result.current.state.logs.length).toBe(initialLogCount + 2);
    });

    it('heater enabled log includes target and wattage', () => {
      const { result } = renderHook(() => useSimulation('betta'), { wrapper });

      // First disable, then enable to get the enabled log
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
    // Use bare preset for evaporation tests (no ATO)
    const tankCapacity = 40; // bare preset default

    it('applies action to state', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      // First reduce water level by advancing simulation (evaporation)
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const waterLevelBefore = result.current.state.resources.water;
      expect(waterLevelBefore).toBeLessThan(tankCapacity); // Evaporation occurred

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.resources.water).toBe(tankCapacity);
    });

    it('works when simulation is paused', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      // Simulate evaporation manually by running some ticks
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const waterLevelBefore = result.current.state.resources.water;

      // Ensure simulation is not playing (paused)
      expect(result.current.isPlaying).toBe(false);

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      // Water should be topped off even when paused
      expect(result.current.state.resources.water).toBe(tankCapacity);
      expect(result.current.state.resources.water).toBeGreaterThan(
        waterLevelBefore
      );
    });

    it('top off action appears in logs', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      // Reduce water level first
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const logCountBefore = result.current.state.logs.length;

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.logs.length).toBeGreaterThan(logCountBefore);
      const lastLog =
        result.current.state.logs[result.current.state.logs.length - 1];
      expect(lastLog.source).toBe('user');
      expect(lastLog.message).toContain('Topped off water');
    });

    it('multiple actions can be executed', () => {
      const { result } = renderHook(() => useSimulation('bare'), { wrapper });

      // Run simulation to cause evaporation
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      // Execute first top off
      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });
      expect(result.current.state.resources.water).toBe(tankCapacity);

      // Run more ticks
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const waterLevelAfterEvaporation = result.current.state.resources.water;
      expect(waterLevelAfterEvaporation).toBeLessThan(tankCapacity);

      // Execute second top off
      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });
      expect(result.current.state.resources.water).toBe(tankCapacity);
    });

    it('top off increases water level to capacity', () => {
      // Use community preset for larger tank (150L)
      const { result } = renderHook(() => useSimulation('community'), { wrapper });
      const communityCapacity = 150;

      // Disable ATO first so evaporation can occur
      act(() => {
        result.current.updateAtoEnabled(false);
      });

      // Run simulation to cause evaporation
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      expect(result.current.state.resources.water).toBeLessThan(communityCapacity);

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.resources.water).toBe(communityCapacity);
    });
  });
});
