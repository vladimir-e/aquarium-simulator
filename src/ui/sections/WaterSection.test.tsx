import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { WaterSection } from './WaterSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState, type RunSnapshot } from '../run/index.js';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

interface Run {
  state: SimulationState;
  history: RunSnapshot[];
}

function bare(state: SimulationState = createSimulation({ tankCapacity: 200 })): Run {
  return { state, history: [snapshotFromState(state)] };
}

/** Ten days of a stocked, planted, fed tank — every section has real figures. */
function stocked(): Run {
  let state = createSimulation({ tankCapacity: 200 });
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  for (let i = 0; i < 2; i++) {
    state = applyAction(state, { type: 'addPlant', species: 'anubias' }).state;
  }

  const history = [snapshotFromState(state)];
  for (let hour = 0; hour < 24 * 10; hour++) {
    if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 0.5 }).state;
    state = tick(state, DEFAULT_CONFIG);
    history.push(snapshotFromState(state));
  }
  return { state, history };
}

function renderWater(run: Run = bare()): { onAct: ReturnType<typeof vi.fn> } {
  const sim = stubSim(run.state) as ReturnType<typeof useSimulation> & { history: RunSnapshot[] };
  Object.assign(sim, { history: run.history });
  const onAct = vi.fn();

  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<Outlet context={{ needs: [], onAct }} />}>
                <Route index element={<WaterSection sim={sim} config={DEFAULT_CONFIG} />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
  return { onAct };
}

/** A reading row, found by the name it leads with. */
function row(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name} `) });
}

describe('WaterSection', () => {
  it('reads down the left column and then the right, cycle above its bacteria', () => {
    renderWater(stocked());

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Water',
      'Gases',
      'Nutrients',
      'Nitrogen',
      'Biofilter',
      'Waste',
    ]);
  });

  it('names every reading the tank takes, each in its own section', () => {
    renderWater(stocked());

    const section = (title: string): HTMLElement =>
      screen.getByRole('heading', { level: 2, name: title }).parentElement!;

    for (const [title, names] of [
      ['Water', ['Temp', 'pH', 'Level']],
      ['Gases', ['O₂', 'CO₂']],
      ['Nutrients', ['NO₃', 'PO₄', 'K', 'Fe']],
      ['Nitrogen', ['NH₃', 'NO₂', 'NO₃']],
    ] as const) {
      for (const name of names) {
        expect(within(section(title)).getByText(name)).toBeTruthy();
      }
    }
  });

  it('says what the tank is running on, and offers the two verbs that move it', () => {
    const { onAct } = renderWater();

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText(/^(no heater|heater on) · ATO (on|off)$/)).toBeTruthy();

    fireEvent.click(within(header).getByRole('button', { name: 'Water change · 25 %' }));
    fireEvent.click(within(header).getByRole('button', { name: 'Top off' }));
    expect(onAct).toHaveBeenCalledTimes(2);
  });

  it('opens the same inspector from any row it is tapped on', () => {
    renderWater(stocked());
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(row('NH₃'));
    const drawer = screen.getByRole('dialog', { name: 'NH₃' });
    expect(within(drawer).getByText(/Safe at or under/)).toBeTruthy();

    fireEvent.click(row('Temp'));
    expect(screen.getByRole('dialog', { name: 'Temp' })).toBeTruthy();
  });

  it('leaves temperature unbanded until something in the tank prefers one', () => {
    renderWater();
    expect(row('Temp').querySelector('.bg-band')).toBeNull();

    cleanup();
    renderWater(stocked());
    expect(row('Temp').querySelector('.bg-band')).toBeTruthy();
  });

  it('states the band at the precision the reading is read to', () => {
    renderWater(stocked());
    fireEvent.click(row('Temp'));

    const drawer = screen.getByRole('dialog', { name: 'Temp' });
    expect(within(drawer).getByText(/^\d+\.\d–\d+\.\d°[CF] — the span/)).toBeTruthy();
  });

  it('carries the biofilter, its guilds and where the nitrite peak falls', () => {
    renderWater();

    const biofilter = screen.getByRole('heading', { level: 2, name: 'Biofilter' }).closest('section')!;
    expect(within(biofilter).getByText('uncycled')).toBeTruthy();
    expect(within(biofilter).getByText('AOB')).toBeTruthy();
    expect(within(biofilter).getByText('NOB')).toBeTruthy();
    expect(within(biofilter).getByText(/Uncycled\./)).toBeTruthy();
    expect(within(biofilter).getByText(/Nitrite peaks in|No nitrite peak within/)).toBeTruthy();
  });

  it('names every waste source, substrate included, on an unstocked soil tank', () => {
    renderWater(bare(createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } })));

    const waste = screen.getByRole('heading', { level: 2, name: 'Waste' }).closest('section')!;
    for (const label of ['Food decay', 'Fish', 'Plants', 'Substrate']) {
      expect(within(waste).getByText(label)).toBeTruthy();
    }
    expect(within(waste).getByText(/%\/h decay · .+ % to waste · Q10/)).toBeTruthy();
  });

  it('prints a rate under its own precision as steady rather than a signed zero', () => {
    renderWater();
    fireEvent.click(row('Waste'));

    const drawer = screen.getByRole('dialog', { name: 'Waste' });
    expect(within(drawer).queryByText(/[+−]0\.000 g\/h/)).toBeNull();
    expect(within(drawer).getAllByText('steady').length).toBeGreaterThan(0);
  });
});
