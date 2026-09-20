import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ReadingDrawer } from './ReadingDrawer';
import { readTank, type ReadingBook } from '../../readings';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { stocked } from '../../test/run';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';

const run = stocked();
const book: ReadingBook = readTank({
  state: run.state,
  config: DEFAULT_CONFIG,
  history: run.history,
  units: 'metric',
});

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  cleanup();
});

function open(id: 'ammonia' | 'potassium'): HTMLElement {
  render(<ReadingDrawer id={id} book={book} history={run.history} onClose={vi.fn()} />);
  return screen.getByRole('dialog', { name: book.byId[id].name });
}

describe('ReadingDrawer', () => {
  it('shows nothing until a reading is named', () => {
    const { container } = render(
      <ReadingDrawer id={null} book={book} history={run.history} onClose={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('leads with the reading and what its band means', () => {
    const reading = book.byId.ammonia;
    const drawer = open('ammonia');

    expect(within(drawer).getByText(reading.value)).toBeTruthy();
    expect(within(drawer).getByText(reading.unit)).toBeTruthy();
    expect(within(drawer).getByText(reading.sentence)).toBeTruthy();
  });

  it('draws the week behind a reading the buffer records', () => {
    const drawer = open('ammonia');
    const week = within(drawer).getByRole('img', { name: 'The last week' });

    expect(week.querySelectorAll('[data-line]')).toHaveLength(1);
    expect(within(drawer).getByText('7 days')).toBeTruthy();
  });

  it('draws no week for a reading the buffer does not carry', () => {
    const drawer = open('potassium');

    expect(within(drawer).queryByRole('img', { name: 'The last week' })).toBeNull();
  });
});
