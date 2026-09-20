import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GearSection } from './GearSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
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
            <Route
              path="/gear/:deviceId?"
              element={<GearSection sim={stubSim(base)} config={DEFAULT_CONFIG} />}
            />
          </Routes>
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

/** The tracks a template declares, read off the class the row is laid out by. */
function declared(className: string): number {
  const template = /(?:^|\s)grid-cols-\[([^\]]+)\]/.exec(className)![1];
  return template.split('_').length;
}

/** `hidden` on its own — `md:hidden` is a cell this width still shows. */
function onPhone(cell: HTMLElement): boolean {
  return !/(?:^|\s)hidden(?:\s|$)/.test(cell.className) && !cell.className.includes('absolute');
}

function rackRows(): HTMLElement[] {
  return [
    ...screen
      .getByRole('heading', { level: 2, name: 'Fittings' })
      .parentElement!.parentElement!.querySelectorAll<HTMLElement>('div.grid'),
  ];
}

describe('GearSection (phone)', () => {
  it('fills every track the phone template declares, on every row', () => {
    renderGear();
    const rows = rackRows();
    expect(rows).toHaveLength(8);

    for (const row of rows) {
      const cells = ([...row.children] as HTMLElement[]).filter(onPhone);
      expect(cells).toHaveLength(declared(row.className));
    }
  });

  it('still switches and still opens, where there is less room to read', () => {
    renderGear();

    expect(screen.getByRole('switch', { name: 'Light power' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /^Light —/ }));

    const sheet = screen.getByRole('dialog', { name: 'Light' });
    expect(within(sheet).getByRole('group', { name: 'Start hour' })).toBeTruthy();
    expect(sheet.className).toContain('inset-0');
  });
});
