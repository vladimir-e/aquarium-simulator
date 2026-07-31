import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EquipmentSection } from './EquipmentSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

// Phone: the inspector is pushed over the list rather than standing beside it.
beforeEach(() => {
  media = stubMatchMedia((query) => query === MOBILE_QUERY);
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function stubSim(state: SimulationState): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    { state },
    {
      get(target: { state: SimulationState }, prop: string): unknown {
        if (prop === 'state') return target.state;
        if (!cache.has(prop)) cache.set(prop, vi.fn());
        return cache.get(prop);
      },
    }
  ) as unknown as ReturnType<typeof useSimulation>;
}

function Address(): React.JSX.Element {
  return <span data-testid="address">{useLocation().pathname}</span>;
}

function renderSection(path = '/equipment'): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/equipment/:deviceId?"
              element={<EquipmentSection sim={stubSim(base)} config={DEFAULT_CONFIG} />}
            />
          </Routes>
          <Address />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

function address(): string {
  return screen.getByTestId('address').textContent ?? '';
}

describe('EquipmentSection (mobile)', () => {
  it('pushes a full-screen editor when a device row is tapped, and pops it on back', () => {
    renderSection();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: /Heater/ }));
    const dialog = screen.getByRole('dialog', { name: /Heater/ });
    expect(within(dialog).getByText('Target')).toBeTruthy();
    expect(address()).toBe('/equipment/heater');

    fireEvent.click(within(dialog).getByRole('button', { name: /back/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(address()).toBe('/equipment');
  });

  it('leaves nothing behind the editor to tab into, and builds only the one', () => {
    renderSection();
    fireEvent.click(screen.getByRole('link', { name: /Heater/ }));

    expect(screen.getByRole('dialog', { name: /Heater/ })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    // One inspector: the desktop one must not be built and hidden underneath.
    expect(screen.getAllByRole('switch', { name: 'Heater enabled' })).toHaveLength(1);
  });

  it('opens straight into the editor for a deep link, and back still reaches the list', () => {
    renderSection('/equipment/co2Generator');
    const dialog = screen.getByRole('dialog', { name: /CO₂ injector/ });
    expect(within(dialog).getByText('Bubble rate')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /back/i }));
    expect(address()).toBe('/equipment');
    expect(screen.getByRole('link', { name: /Filter/ })).toBeTruthy();
  });

  it('returns focus to the row that pushed the editor', () => {
    renderSection();
    const row = screen.getByRole('link', { name: /Heater/ });
    fireEvent.click(row);

    fireEvent.click(
      within(screen.getByRole('dialog', { name: /Heater/ })).getByRole('button', { name: /back/i })
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /Heater/ }));
  });
});
