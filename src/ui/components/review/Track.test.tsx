import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Track } from './Track';
import { TRACKS, TRACK_COLORS, seriesExtent, type TrackLine } from '../../review';

afterEach(cleanup);

const range = { minTick: 0, maxTick: 10 };
const ticks = Array.from({ length: 11 }, (_, i) => i);

function line(values: number[]): TrackLine {
  return {
    series: TRACKS[0].series[0],
    color: TRACK_COLORS[0],
    values,
    extent: seriesExtent(values),
  };
}

function band(container: HTMLElement): SVGElement {
  return container.querySelector('svg')!;
}

describe('Track', () => {
  it('draws one polyline per line, across the ticks it was given', () => {
    const { container } = render(
      <Track lines={[line(ticks)]} ticks={ticks} range={range} label="Nitrogen" />
    );
    const drawn = band(container).querySelectorAll('[data-line]');

    expect(drawn).toHaveLength(1);
    expect(drawn[0].getAttribute('points')!.split(' ')).toHaveLength(ticks.length);
  });

  it('lights the hours the fixture ran, behind the lines', () => {
    const { container } = render(
      <Track
        lines={[line(ticks)]}
        ticks={ticks}
        range={range}
        lit={[{ from: 2, to: 4 }]}
        label="Nitrogen"
      />
    );
    const lit = band(container).querySelector('[data-lit]')!;

    expect(lit.getAttribute('x')).toBe('200');
    expect(lit.getAttribute('width')).toBe('200');
  });

  it('stands the playhead where the tick is, and draws none while it follows', () => {
    const { container, rerender } = render(
      <Track lines={[line(ticks)]} ticks={ticks} range={range} at={5} label="Nitrogen" />
    );
    const playhead = band(container).querySelector('[data-playhead]')!;

    expect(playhead.getAttribute('x1')).toBe('500');

    rerender(
      <Track lines={[line(ticks)]} ticks={ticks} range={range} at={null} label="Nitrogen" />
    );
    expect(band(container).querySelector('[data-playhead]')).toBeNull();
  });

  it('has no height of its own — whatever sizes it says how tall', () => {
    const { container } = render(
      <Track lines={[line(ticks)]} ticks={ticks} range={range} label="Nitrogen" className="h-10" />
    );

    expect(band(container).getAttribute('class')).toBe('block w-full h-10');
  });
});
