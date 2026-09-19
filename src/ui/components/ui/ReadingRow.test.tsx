import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReadingRow } from './ReadingRow';

afterEach(cleanup);

describe('ReadingRow', () => {
  it('reads name, value, unit, trend and note in that order', () => {
    render(
      <ReadingRow name="NO₃" value="3.4" unit="ppm" at={0.1} band={{ from: 0.05, to: 0.8 }} trend="↘ 0.2/d" note="plants need 4.5" />
    );

    expect(screen.getByText('NO₃')).toBeTruthy();
    expect(screen.getByText('3.4')).toBeTruthy();
    expect(screen.getByText('ppm')).toBeTruthy();
    expect(screen.getByText('↘ 0.2/d')).toBeTruthy();
    expect(screen.getByText('plants need 4.5')).toBeTruthy();
  });

  it('tints the number with the reading, never the row', () => {
    const { container } = render(<ReadingRow name="NH₃" value="0.42" unit="ppm" at={1} tone="alert" />);

    expect(screen.getByText('0.42').className).toContain('text-alert');
    expect(container.firstElementChild!.className).not.toContain('alert');
  });

  it('holds the strip column empty rather than inventing a band', () => {
    const { container } = render(<ReadingRow name="pH" value="6.12" />);
    const cells = Array.from(container.firstElementChild!.children);

    expect(cells).toHaveLength(4);
    expect(cells[2].children).toHaveLength(0);
  });

  it('is a button only where there is a drawer behind it', () => {
    const onClick = vi.fn();
    const { container } = render(<ReadingRow name="pH" value="6.12" onClick={onClick} />);
    fireEvent.click(container.querySelector('button')!);

    expect(onClick).toHaveBeenCalled();
  });
});
