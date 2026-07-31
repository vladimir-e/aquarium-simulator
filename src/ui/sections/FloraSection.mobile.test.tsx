import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { FloraSection } from './FloraSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

// Phone: the header has no room for construction verbs, so they ride the lists.
beforeEach(() => {
  media = stubMatchMedia((query) => query === MOBILE_QUERY);
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

function renderFlora(state: SimulationState = createSimulation({ tankCapacity: 200 })): void {
  const sim = { state } as unknown as ReturnType<typeof useSimulation>;
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <FloraSection sim={sim} config={DEFAULT_CONFIG} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('FloraSection (mobile)', () => {
  it('moves each construction verb out of the header and into the card it builds', () => {
    renderFlora();

    const header = screen.getByRole('heading', { level: 1, name: 'Flora & Scape' }).parentElement!;
    expect(within(header).queryByRole('button')).toBeNull();

    const plants = screen.getByRole('heading', { level: 2, name: 'Plants' }).closest('section')!;
    expect(within(plants).getByRole('button', { name: 'Add plant' })).toBeTruthy();

    const scape = screen.getByRole('heading', { level: 2, name: 'Scape' }).closest('section')!;
    expect(within(scape).getByRole('button', { name: 'Add hardscape' })).toBeTruthy();
  });

  it('builds each verb once, so nothing is duplicated behind the fold', () => {
    renderFlora();
    expect(screen.getAllByRole('button', { name: 'Add plant' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Add hardscape' })).toHaveLength(1);
  });
});
