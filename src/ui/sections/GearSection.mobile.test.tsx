import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GearSection } from './GearSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
import { StageOutlet } from '../test/stage';
import { stubSim } from '../test/stubSim';

let media: MatchMediaStub;

// Phone: the rack keeps its switch, its name and its setting, and drops the rest.
beforeEach(() => {
  media = stubMatchMedia(viewport(390));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function renderGear(path = '/gear'): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<StageOutlet />}>
              <Route
                path="/gear/:deviceId?"
                element={<GearSection sim={stubSim(base)} config={DEFAULT_CONFIG} />}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

/** The eight fittings, in rack order. */
const DEVICES = [
  'Filter',
  'Heater',
  'Light',
  'Air pump',
  'ATO',
  'CO₂ injector',
  'Powerhead',
  'Auto doser',
];

describe('GearSection (phone)', () => {
  it('reads every fitting out in full where there is least room for it', () => {
    renderGear();

    expect(screen.getAllByRole('group')).toHaveLength(DEVICES.length);

    for (const name of DEVICES) {
      const row = within(screen.getByRole('group', { name }));
      // Its switch, its name and the sentence the whole row is a link to.
      expect(row.getByRole('switch', { name: `${name} power` })).toBeTruthy();
      expect(row.getByText(name)).toBeTruthy();
      expect(row.getByRole('link', { name: new RegExp(`^${name} — .`) })).toBeTruthy();
    }
  });

  it('still switches and still opens, where there is less room to read', () => {
    renderGear();

    expect(screen.getByRole('switch', { name: 'Light power' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /^Light —/ }));

    const sheet = screen.getByRole('dialog', { name: 'Light' });
    expect(within(sheet).getByRole('group', { name: 'Start hour' })).toBeTruthy();
  });
});
