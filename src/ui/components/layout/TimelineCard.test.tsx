import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TimelineCard } from './TimelineCard';

afterEach(cleanup);

interface Handlers {
  onPlayPause: ReturnType<typeof vi.fn>;
  onStep: ReturnType<typeof vi.fn>;
  onSpeedChange: ReturnType<typeof vi.fn>;
}

function renderCard(overrides: Partial<Parameters<typeof TimelineCard>[0]> = {}): Handlers {
  const onPlayPause = vi.fn();
  const onStep = vi.fn();
  const onSpeedChange = vi.fn();
  render(
    <TimelineCard
      tick={0}
      isPlaying={false}
      speed="1h"
      lightSchedule={{ startHour: 8, duration: 10 }}
      lightOn
      onPlayPause={onPlayPause}
      onStep={onStep}
      onSpeedChange={onSpeedChange}
      {...overrides}
    />
  );
  return { onPlayPause, onStep, onSpeedChange };
}

describe('TimelineCard', () => {
  it('leads with Start simulation before the first tick', () => {
    const { onPlayPause } = renderCard();

    expect(screen.getByText('not started')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Start simulation/ }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('swaps to the transport once the run is under way', () => {
    renderCard({ tick: 1622, isPlaying: true });

    expect(screen.queryByRole('button', { name: /Start simulation/ })).toBeNull();
    expect(screen.getByText('Day 68 · 14:00')).toBeTruthy();
    expect(screen.getByText('tick 1622 · 67 d elapsed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('names the photoperiod, and says so when the light is off', () => {
    renderCard({ tick: 1622 });
    expect(screen.getByText('lights 08–18')).toBeTruthy();

    cleanup();
    renderCard({ tick: 1622, lightOn: false });
    expect(screen.getByText('no light')).toBeTruthy();
  });

  it('steps a whole day, independently of the speed', () => {
    const { onStep } = renderCard({ tick: 24, speed: '1d' });
    fireEvent.click(screen.getByRole('button', { name: /Step \+1 day/ }));
    expect(onStep).toHaveBeenCalledTimes(1);
  });
});
