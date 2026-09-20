import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DEVICE_ORDER } from '../../build';
import { DeviceGlyph } from './DeviceGlyph';

afterEach(cleanup);

describe('DeviceGlyph', () => {
  it('draws every device the rack can list', () => {
    for (const device of DEVICE_ORDER) {
      const { container } = render(<DeviceGlyph device={device} />);
      expect(container.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('is drawn, never filled — a silhouette is a line', () => {
    const { container } = render(<DeviceGlyph device="filter" />);
    const svg = container.querySelector('svg')!;

    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('takes the caller’s box and tone in place of its own, not beside them', () => {
    const { container } = render(
      <DeviceGlyph device="heater" size="h-5 w-5" tone="text-ink-3" className="relative" />
    );
    const className = container.querySelector('svg')!.getAttribute('class')!;

    expect(className).toContain('h-5 w-5');
    expect(className).toContain('text-ink-3');
    expect(className).not.toContain('h-4');
    expect(className).not.toContain('text-ink-2');
    expect(className).toContain('relative');
  });
});
