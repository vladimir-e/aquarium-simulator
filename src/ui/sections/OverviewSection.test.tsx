import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { OverviewSection } from './OverviewSection';
import { activeNeeds } from '../nav';
import { createSimulation } from '../../simulation/index.js';

afterEach(cleanup);

const BASE = createSimulation({ tankCapacity: 40 });

/** The grid as the shell mounts it: the needs are worked out above it. */
function renderOverview(flags: Partial<typeof BASE.alertState> = {}): void {
  const state = { ...BASE, alertState: { ...BASE.alertState, ...flags } };
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ needs: activeNeeds(state) }} />}>
          <Route index element={<OverviewSection />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function strip(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Needs you' });
}

describe('OverviewSection', () => {
  it('says nothing above the grid when the engine has latched nothing', () => {
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('names what is latched, and takes the tone the engine gives it', () => {
    renderOverview({ highAmmonia: true, highNitrate: true });

    expect(strip()).toBeTruthy();
    expect(screen.getByText('NH₃ high').className).toContain('text-alert');
    expect(screen.getByText('NO₃ high').className).toContain('text-warn');
  });

  it('drops the strip again once the tank recovers', () => {
    renderOverview({ highAmmonia: true });
    expect(strip()).toBeTruthy();

    cleanup();
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('anchors the nitrogen cycle across two columns of the grid', () => {
    renderOverview();
    const widget = (title: string): string =>
      screen.getByRole('link', { name: `${title} module` }).closest('section')?.className ?? '';

    expect(widget('Nitrogen')).toContain('col-span-2');
    expect(widget('Life')).not.toContain('col-span-2');
  });
});
