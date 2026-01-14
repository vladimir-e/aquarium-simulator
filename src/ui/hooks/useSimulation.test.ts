import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';

describe('useSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes simulation with default config', () => {
    const { result } = renderHook(() => useSimulation(75));

    expect(result.current.state.tank.capacity).toBe(75);
    expect(result.current.state.resources.water).toBe(75);
    expect(result.current.state.resources.temperature).toBe(25);
    expect(result.current.state.environment.roomTemperature).toBe(22);
    expect(result.current.state.equipment.heater.enabled).toBe(true);
    expect(result.current.state.equipment.heater.targetTemperature).toBe(25);
    expect(result.current.state.equipment.heater.wattage).toBe(100);
    expect(result.current.state.tick).toBe(0);
  });

  it('tick advances simulation state', () => {
    const { result } = renderHook(() => useSimulation(75));

    const initialTick = result.current.state.tick;

    act(() => {
      result.current.step();
    });

    // Default speed is '1hr' which has a multiplier of 1
    expect(result.current.state.tick).toBe(initialTick + 1);
  });

  it('changing tank size reinitializes simulation', () => {
    const { result } = renderHook(() => useSimulation(75));

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
    const { result } = renderHook(() => useSimulation(75));

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
    const { result } = renderHook(() => useSimulation(75));

    act(() => {
      result.current.updateRoomTemperature(25);
    });

    expect(result.current.state.environment.roomTemperature).toBe(25);
  });

  it('play/pause toggles auto-advance', () => {
    const { result } = renderHook(() => useSimulation(75));

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
    const { result } = renderHook(() => useSimulation(75));

    expect(result.current.speed).toBe('1hr');

    act(() => {
      result.current.changeSpeed('1day');
    });

    expect(result.current.speed).toBe('1day');
  });

  describe('logging', () => {
    it('emits log when heater enabled', () => {
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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

    it('logs accumulate across multiple ticks', () => {
      const { result } = renderHook(() => useSimulation(75));
      const initialLogCount = result.current.state.logs.length;

      act(() => {
        result.current.updateHeaterEnabled(false);
        result.current.updateRoomTemperature(20);
      });

      // Should have initial log + 2 new logs
      expect(result.current.state.logs.length).toBe(initialLogCount + 2);
    });

    it('heater enabled log includes target and wattage', () => {
      const { result } = renderHook(() => useSimulation(75));

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
    it('applies action to state', () => {
      const { result } = renderHook(() => useSimulation(75));

      // First reduce water level by advancing simulation (evaporation)
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const waterLevelBefore = result.current.state.resources.water;
      expect(waterLevelBefore).toBeLessThan(75); // Evaporation occurred

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.resources.water).toBe(75);
    });

    it('works when simulation is paused', () => {
      const { result } = renderHook(() => useSimulation(75));

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
      expect(result.current.state.resources.water).toBe(75);
      expect(result.current.state.resources.water).toBeGreaterThan(
        waterLevelBefore
      );
    });

    it('top off action appears in logs', () => {
      const { result } = renderHook(() => useSimulation(75));

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
      const { result } = renderHook(() => useSimulation(75));

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
      expect(result.current.state.resources.water).toBe(75);

      // Run more ticks
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      const waterLevelAfterEvaporation = result.current.state.resources.water;
      expect(waterLevelAfterEvaporation).toBeLessThan(75);

      // Execute second top off
      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });
      expect(result.current.state.resources.water).toBe(75);
    });

    it('top off increases water level to capacity', () => {
      const { result } = renderHook(() => useSimulation(100));

      // Run simulation to cause evaporation
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.step();
        }
      });

      expect(result.current.state.resources.water).toBeLessThan(100);

      act(() => {
        result.current.executeAction({ type: 'topOff' });
      });

      expect(result.current.state.resources.water).toBe(100);
    });
  });
});
