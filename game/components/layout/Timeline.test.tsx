import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Timeline from './Timeline';

describe('Timeline', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders time display', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('11:00')).toBeTruthy();
  });

  it('renders day counter', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('Day 1')).toBeTruthy();
  });

  it('renders play button when not playing', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('renders pause button when playing', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={true}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('renders fast forward button', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Fast forward' })).toBeTruthy();
  });

  it('calls onPlayPause when play button is clicked', () => {
    const onPlayPause = vi.fn();
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={onPlayPause}
        onFastForward={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('calls onFastForward when fast forward button is clicked', () => {
    const onFastForward = vi.fn();
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={onFastForward}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward' }));
    expect(onFastForward).toHaveBeenCalledTimes(1);
  });

  it('fast forward button has aria-pressed when active', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={true}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );

    const ffButton = screen.getByRole('button', { name: 'Fast forward' });
    expect(ffButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('fast forward button has aria-pressed false when inactive', () => {
    render(
      <Timeline
        time="11:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );

    const ffButton = screen.getByRole('button', { name: 'Fast forward' });
    expect(ffButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('displays different time values correctly', () => {
    const { rerender } = render(
      <Timeline
        time="08:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('08:00')).toBeTruthy();

    rerender(
      <Timeline
        time="23:00"
        day={1}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('23:00')).toBeTruthy();
  });

  it('displays different day values correctly', () => {
    const { rerender } = render(
      <Timeline
        time="11:00"
        day={5}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('Day 5')).toBeTruthy();

    rerender(
      <Timeline
        time="11:00"
        day={100}
        isPlaying={false}
        isFastForward={false}
        onPlayPause={vi.fn()}
        onFastForward={vi.fn()}
      />
    );
    expect(screen.getByText('Day 100')).toBeTruthy();
  });
});
