import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TickScrubber } from './TickScrubber';

afterEach(cleanup);

describe('TickScrubber', () => {
  it('nudges the tick with the arrow keys', () => {
    const onScrubToTick = vi.fn();
    render(<TickScrubber range={{ minTick: 0, maxTick: 36 }} currentTick={10} onScrubToTick={onScrubToTick} />);
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onScrubToTick).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onScrubToTick).toHaveBeenLastCalledWith(9);
  });

  it('jumps to the ends and steps a day at a time', () => {
    const onScrubToTick = vi.fn();
    render(<TickScrubber range={{ minTick: 0, maxTick: 36 }} currentTick={10} onScrubToTick={onScrubToTick} />);
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onScrubToTick).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onScrubToTick).toHaveBeenLastCalledWith(36);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onScrubToTick).toHaveBeenLastCalledWith(34); // clamped from 10 + 24
  });

  it('exposes the domain through slider aria attributes', () => {
    render(<TickScrubber range={{ minTick: 12, maxTick: 36 }} currentTick={24} onScrubToTick={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe('12');
    expect(slider.getAttribute('aria-valuemax')).toBe('36');
    expect(slider.getAttribute('aria-valuenow')).toBe('24');
  });

  it('is inert with no run to review', () => {
    const onScrubToTick = vi.fn();
    render(<TickScrubber range={null} currentTick={0} onScrubToTick={onScrubToTick} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onScrubToTick).not.toHaveBeenCalled();
    expect(slider.getAttribute('tabindex')).toBe('-1');
  });
});
