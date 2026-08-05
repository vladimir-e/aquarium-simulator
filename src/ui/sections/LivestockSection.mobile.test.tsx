import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { LivestockSection } from './LivestockSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

// Phone: the header has no room for a construction verb, so it rides the foot.
beforeEach(() => {
  media = stubMatchMedia(viewport(390));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

function renderRoster(state: SimulationState = createSimulation({ tankCapacity: 200 })): void {
  const sim = { state, tankId: 0 } as unknown as ReturnType<typeof useSimulation>;
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <LivestockSection sim={sim} config={DEFAULT_CONFIG} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('LivestockSection (mobile)', () => {
  it('moves the construction verb out of the header and onto the pinned foot', () => {
    renderRoster();

    const header = screen.getByRole('heading', { level: 1, name: 'Livestock' }).parentElement!;
    expect(within(header).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add fish' })).toBeTruthy();
  });

  it('builds the verb once, so nothing is duplicated behind the fold', () => {
    renderRoster();
    expect(screen.getAllByRole('button', { name: 'Add fish' })).toHaveLength(1);
  });

  it('keeps the bioload reading beside it rather than above the scroll', () => {
    renderRoster();
    const foot = screen.getByText('vs guideline').closest<HTMLElement>('div')!;
    expect(within(foot).getByRole('button', { name: 'Add fish' })).toBeTruthy();
    expect(within(foot).queryByRole('table')).toBeNull();
  });
});
