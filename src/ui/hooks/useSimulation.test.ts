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
    expect(result.current.state.tank.waterLevel).toBe(75);
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
    expect(result.current.state.tank.waterLevel).toBe(150);
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
});
