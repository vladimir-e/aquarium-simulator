import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TickScrubber } from './TickScrubber';
import type { AlertMark, TickRange } from '../../review/index.js';

afterEach(cleanup);

function renderScrubber(
  props: {
    range?: TickRange | null;
    currentTick?: number;
    following?: boolean;
    markers?: AlertMark[];
  } = {}
): ReturnType<typeof vi.fn> {
  const onScrub = vi.fn();
  render(
    <TickScrubber
      range={props.range === undefined ? { minTick: 0, maxTick: 36 } : props.range}
      currentTick={props.currentTick ?? 10}
      following={props.following ?? false}
      markers={props.markers ?? []}
      onScrub={onScrub}
    />
  );
  return onScrub;
}

/** Pins the track at 100px so a pointer x maps to a known fraction. */
function fixTrackWidth(slider: HTMLElement): void {
  slider.setPointerCapture = vi.fn();
  slider.releasePointerCapture = vi.fn();
  slider.getBoundingClientRect = (): ReturnType<typeof slider.getBoundingClientRect> => ({
    left: 0,
    top: 0,
    right: 100,
    bottom: 44,
    width: 100,
    height: 44,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('TickScrubber', () => {
  it('nudges the tick with the arrow keys', () => {
    const onScrub = renderScrubber();
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onScrub).toHaveBeenLastCalledWith(11, 'adjust');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onScrub).toHaveBeenLastCalledWith(9, 'adjust');
  });

  it('jumps to the ends and steps a day at a time', () => {
    const onScrub = renderScrubber();
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onScrub).toHaveBeenLastCalledWith(0, 'commit');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onScrub).toHaveBeenLastCalledWith(36, 'commit');
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onScrub).toHaveBeenLastCalledWith(34, 'adjust'); // clamped from 10 + 24
  });

  it('scrubs to the tick under a pointer drag', () => {
    const onScrub = renderScrubber({ currentTick: 0 });
    const slider = screen.getByRole('slider');
    fixTrackWidth(slider);

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(18, 'adjust'); // fraction 0.5 of ticks 0..36

    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(36, 'adjust');

    fireEvent.pointerMove(slider, { clientX: 0, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(0, 'adjust');
  });

  it('steps one tick per press of the ± buttons', () => {
    const onScrub = renderScrubber();
    fireEvent.click(screen.getByRole('button', { name: '−1' }));
    expect(onScrub).toHaveBeenLastCalledWith(9, 'adjust');
    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    expect(onScrub).toHaveBeenLastCalledWith(11, 'adjust');
  });

  it('commits an exact tick typed into the field', () => {
    const onScrub = renderScrubber();
    const field = screen.getByLabelText('Tick');
    expect(screen.getByDisplayValue('10')).toBeTruthy();

    fireEvent.change(field, { target: { value: '27' } });
    expect(onScrub).not.toHaveBeenCalled(); // typing is not scrubbing
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onScrub).toHaveBeenCalledWith(27, 'commit');
  });

  it('clamps a typed tick into the window and ignores nonsense', () => {
    const onScrub = renderScrubber();
    const field = screen.getByLabelText('Tick');

    fireEvent.change(field, { target: { value: '900' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onScrub).toHaveBeenLastCalledWith(36, 'commit');

    fireEvent.change(field, { target: { value: 'soon' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onScrub).toHaveBeenCalledTimes(1);
  });

  it('abandons the draft on escape, leaving the cursor where it was', () => {
    const onScrub = renderScrubber();
    const field = screen.getByLabelText('Tick');
    fireEvent.change(field, { target: { value: '3' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(onScrub).not.toHaveBeenCalled();
  });

  it('returns to the live edge, and offers nothing to return to while there', () => {
    const onScrub = renderScrubber();
    fireEvent.click(screen.getByRole('button', { name: /Live edge/ }));
    expect(onScrub).toHaveBeenCalledWith(36, 'commit');

    cleanup();
    renderScrubber({ following: true });
    expect(screen.getByRole('button', { name: /Live edge/ }).hasAttribute('disabled')).toBe(true);
  });

  it('reads the cursor as a wall clock, not just a tick', () => {
    renderScrubber({ range: { minTick: 1598, maxTick: 1622 }, currentTick: 1608 });
    expect(screen.getByText('Day 68 · 00:00')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe(
      'tick 1608, Day 68 · 00:00'
    );
  });

  it('marks the run’s alerts on the track', () => {
    renderScrubber({
      range: { minTick: 0, maxTick: 100 },
      markers: [
        { tick: 25, kind: 'nitrite' },
        { tick: 80, kind: 'oxygen' },
      ],
    });
    expect(screen.getByTitle('NO₂ @25').style.left).toBe('25%');
    expect(screen.getByTitle('O₂ @80').style.left).toBe('80%');
  });

  it('exposes the domain through slider aria attributes', () => {
    renderScrubber({ range: { minTick: 12, maxTick: 36 }, currentTick: 24 });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe('12');
    expect(slider.getAttribute('aria-valuemax')).toBe('36');
    expect(slider.getAttribute('aria-valuenow')).toBe('24');
  });

  it('is inert with no run to review', () => {
    const onScrub = renderScrubber({ range: null, currentTick: 0 });
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    expect(onScrub).not.toHaveBeenCalled();
    expect(slider.getAttribute('tabindex')).toBe('-1');
  });
});
