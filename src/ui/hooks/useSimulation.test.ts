import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';

describe('useSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes simulation with default config', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.state.tick).toBe(0);
      expect(result.current.state.tank.capacity).toBe(75);
      expect(result.current.state.tank.waterLevel).toBe(75);
      expect(result.current.state.environment.roomTemperature).toBe(22);
      expect(result.current.state.resources.temperature).toBe(25);
    });

    it('initializes heater with default values', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.state.equipment.heater.enabled).toBe(true);
      expect(result.current.state.equipment.heater.targetTemperature).toBe(25);
      expect(result.current.state.equipment.heater.wattage).toBe(100);
    });

    it('initializes with isPlaying false', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.isPlaying).toBe(false);
    });

    it('initializes with default speed 6hr/s', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.speed).toBe('6hr/s');
    });
  });

  describe('step', () => {
    it('advances simulation state by one tick', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.step();
      });

      expect(result.current.state.tick).toBe(1);
    });

    it('advances simulation state by multiple ticks', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.step();
        result.current.step();
        result.current.step();
      });

      expect(result.current.state.tick).toBe(3);
    });
  });

  describe('stepMultiple', () => {
    it('advances simulation by specified number of ticks', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.stepMultiple(6);
      });

      expect(result.current.state.tick).toBe(6);
    });
  });

  describe('changing tank size', () => {
    it('reinitializes simulation with new capacity', () => {
      const { result } = renderHook(() => useSimulation());

      // Advance some ticks first
      act(() => {
        result.current.step();
        result.current.step();
      });

      expect(result.current.state.tick).toBe(2);

      // Change tank size
      act(() => {
        result.current.setTankCapacity(150);
      });

      // Should reset to tick 0 with new capacity
      expect(result.current.state.tick).toBe(0);
      expect(result.current.state.tank.capacity).toBe(150);
      expect(result.current.state.tank.waterLevel).toBe(150);
    });
  });

  describe('heater controls', () => {
    it('updates heater enabled state', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setHeaterEnabled(false);
      });

      expect(result.current.state.equipment.heater.enabled).toBe(false);
    });

    it('updates heater target temperature', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setHeaterTargetTemp(28);
      });

      expect(result.current.state.equipment.heater.targetTemperature).toBe(28);
    });

    it('updates heater wattage', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setHeaterWattage(200);
      });

      expect(result.current.state.equipment.heater.wattage).toBe(200);
    });
  });

  describe('room temperature changes', () => {
    it('updates room temperature in simulation state', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setRoomTemperature(20);
      });

      expect(result.current.state.environment.roomTemperature).toBe(20);
    });
  });

  describe('play/pause controls', () => {
    it('toggles isPlaying state', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.isPlaying).toBe(false);

      act(() => {
        result.current.togglePlay();
      });

      expect(result.current.isPlaying).toBe(true);

      act(() => {
        result.current.togglePlay();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('auto-advances ticks when playing at 1hr/s', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setSpeed('1hr/s');
        result.current.togglePlay();
      });

      // Should advance one tick per second at 1hr/s
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.state.tick).toBe(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.state.tick).toBe(2);
    });

    it('auto-advances ticks faster at higher speeds', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setSpeed('6hr/s');
        result.current.togglePlay();
      });

      // At 6hr/s, should advance 6 ticks per second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.state.tick).toBe(6);
    });

    it('stops auto-advancing when paused', () => {
      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.setSpeed('1hr/s');
        result.current.togglePlay();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.state.tick).toBe(2);

      act(() => {
        result.current.togglePlay(); // Pause
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Should still be at 2, not advancing
      expect(result.current.state.tick).toBe(2);
    });
  });

  describe('speed controls', () => {
    it('changes speed preset', () => {
      const { result } = renderHook(() => useSimulation());

      expect(result.current.speed).toBe('6hr/s');

      act(() => {
        result.current.setSpeed('1day/s');
      });

      expect(result.current.speed).toBe('1day/s');
    });
  });
});
