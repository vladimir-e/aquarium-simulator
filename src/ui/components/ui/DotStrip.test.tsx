import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DotStrip } from './DotStrip';
import type { Status } from '../../run';

afterEach(cleanup);

function strip(statuses: Status[]): HTMLElement[] {
  render(<DotStrip statuses={statuses} label="group" />);
  return Array.from(screen.getByRole('img', { name: 'group' }).children) as HTMLElement[];
}

describe('DotStrip', () => {
  it('draws a dot per member while two lines hold them', () => {
    expect(strip(Array<Status>(18).fill('ok'))).toHaveLength(18);
  });

  it('folds past two lines into one bar, each tone at its share, worst first', () => {
    const statuses: Status[] = [
      ...Array<Status>(14).fill('ok'),
      ...Array<Status>(3).fill('warn'),
      ...Array<Status>(2).fill('alert'),
      'neutral',
    ];
    const segments = strip(statuses);

    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['2', '3', '15']);
    expect(segments[0].className).toContain('bg-alert');
  });
});
