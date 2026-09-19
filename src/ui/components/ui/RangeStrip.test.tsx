import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RangeStrip } from './RangeStrip';

afterEach(cleanup);

function parts(container: HTMLElement): { band: HTMLElement | null; marker: HTMLElement } {
  const children = Array.from(container.firstElementChild!.children) as HTMLElement[];
  return children.length === 1
    ? { band: null, marker: children[0] }
    : { band: children[0], marker: children[1] };
}

describe('RangeStrip', () => {
  it('lights the band it is given and stands the marker on the value', () => {
    const { container } = render(<RangeStrip at={0.4} band={{ from: 0.2, to: 0.8 }} />);
    const { band, marker } = parts(container);

    expect(band!.style.left).toBe('20%');
    expect(parseFloat(band!.style.width)).toBeCloseTo(60);
    expect(marker.style.left).toBe('calc(40% - 1px)');
  });

  it('lights nothing for a reading with no band, and stays ink', () => {
    const { container } = render(<RangeStrip at={0.5} />);
    const { band, marker } = parts(container);

    expect(band).toBeNull();
    expect(marker.className).toContain('bg-ink');
  });

  it('tints only the marker, by the severity the engine gave the reading', () => {
    const { container } = render(<RangeStrip at={2} band={{ from: 0.8, to: 0.2 }} tone="alert" />);
    const { band, marker } = parts(container);

    // The band is normalised whichever way round it arrives, and a value off
    // the end of the track pins to the end rather than escaping it.
    expect(band!.style.left).toBe('20%');
    expect(marker.style.left).toBe('calc(100% - 1px)');
    expect(marker.className).toContain('bg-alert');
  });
});
