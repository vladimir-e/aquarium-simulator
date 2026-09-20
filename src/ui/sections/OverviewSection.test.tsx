import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { OverviewSection } from './OverviewSection';
import { activeNeeds } from '../nav';
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
  type AlertState,
  type SimulationState,
} from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

interface Run {
  state: SimulationState;
  history: RunSnapshot[];
}

function bare(): Run {
  const state = createSimulation({ tankCapacity: 200 });
  return { state, history: [snapshotFromState(state)] };
}

/** Ten days of a stocked, planted, fed tank — every widget has real figures. */
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

function renderOverview(
  run: Run = bare(),
  flags: Partial<AlertState> = {}
): ReturnType<typeof useSimulation> {
  const state = { ...run.state, alertState: { ...run.state.alertState, ...flags } };
  const sim = stubSim(state) as ReturnType<typeof useSimulation> & { history: RunSnapshot[] };
  Object.assign(sim, { history: run.history });

  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<Outlet context={{ needs: activeNeeds(state), onAct: vi.fn() }} />}>
                <Route
                  index
                  element={<OverviewSection sim={sim} config={DEFAULT_CONFIG} />}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
  return sim;
}

/** The devices the rack lists, and the switch label each one carries. */
const DEVICES = [
  'filter',
  'heater',
  'light',
  'airPump',
  'ato',
  'co2Generator',
  'powerhead',
  'autoDoser',
] as const;

const NAMES: Record<(typeof DEVICES)[number], string> = {
  filter: 'Filter power',
  heater: 'Heater power',
  light: 'Light power',
  airPump: 'Air pump power',
  ato: 'ATO power',
  co2Generator: 'CO₂ injector power',
  powerhead: 'Powerhead power',
  autoDoser: 'Auto doser power',
};

function strip(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Needs you' });
}

function widget(title: string): HTMLElement {
  return screen.getByRole('link', { name: `${title} module` }).closest('section')!;
}

describe('OverviewSection', () => {
  it('says nothing above the grid when the engine has latched nothing', () => {
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('names what is latched, in the tone the engine gives it, with the verb that answers it', () => {
    renderOverview(bare(), { highAmmonia: true, highNitrate: true });

    expect(screen.getByText('NH₃ high').className).toContain('text-alert');
    expect(screen.getByText('NO₃ high').className).toContain('text-warn');
    expect(within(strip()!).getAllByRole('link', { name: /Water change/ })).toHaveLength(2);
  });

  it('routes a need into the module that owns its verb', () => {
    renderOverview(bare(), { highAlgae: true });

    expect(within(strip()!).getByRole('link', { name: /Scrub/ }).getAttribute('href')).toBe(
      '/life'
    );
  });

  it('drops the strip again once the tank recovers', () => {
    renderOverview(bare(), { highAmmonia: true });
    expect(strip()).toBeTruthy();

    cleanup();
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('anchors the nitrogen cycle across two columns of the grid', () => {
    renderOverview();

    expect(widget('Nitrogen').className).toContain('col-span-2');
    expect(widget('Life').className).not.toContain('col-span-2');
  });

  it('draws the cycle as a chain of four stocks', () => {
    renderOverview(stocked());
    const nitrogen = within(widget('Nitrogen'));

    for (const stock of ['Waste', 'NH₃', 'NO₂', 'NO₃']) {
      expect(nitrogen.getByRole('button', { name: new RegExp(stock) })).toBeTruthy();
    }
    expect(nitrogen.getByText('AOB')).toBeTruthy();
    expect(nitrogen.getByText('NOB')).toBeTruthy();
  });

  it('opens a stock in the reading drawer, and closes it again', () => {
    renderOverview(stocked());

    fireEvent.click(within(widget('Nitrogen')).getByRole('button', { name: /NO₂/ }));
    const drawer = screen.getByRole('dialog', { name: 'NO₂' });
    expect(within(drawer).getByText(/Safe at or under/)).toBeTruthy();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close NO₂' }));
    expect(screen.queryByRole('dialog', { name: 'NO₂' })).toBeNull();
  });

  it('bands temperature on what is stocked, and leaves it unbanded when nothing is', () => {
    renderOverview(stocked());
    fireEvent.click(within(widget('Water')).getByRole('button', { name: /Temp/ }));
    expect(
      within(screen.getByRole('dialog')).getByText(/the span every stocked species tolerates/)
    ).toBeTruthy();

    cleanup();
    renderOverview(bare());
    fireEvent.click(within(widget('Water')).getByRole('button', { name: /Temp/ }));
    expect(
      within(screen.getByRole('dialog')).getByText(/Nothing stocked, so nothing/)
    ).toBeTruthy();
  });

  it('lists a species once, with a dot for every fish in it', () => {
    renderOverview(stocked());
    const life = within(widget('Life'));

    expect(life.getAllByText(/Neon/i)).toHaveLength(1);
    expect(life.getByRole('img', { name: /Neon.* by individual/i }).children).toHaveLength(6);
  });

  it('lists a plant species once, with a dot for every specimen', () => {
    renderOverview(stocked());
    const life = within(widget('Life'));

    expect(life.getByText(/×2 · \d+ % size/)).toBeTruthy();
    expect(life.getByRole('img', { name: /Anubias by individual/i }).children).toHaveLength(2);
  });

  it('gives the algae row no dots to speak of', () => {
    renderOverview(stocked());
    expect(within(widget('Life')).queryByRole('img', { name: /Algae/i })).toBeNull();
  });

  it('invites stocking when the tank is bare', () => {
    renderOverview(bare());
    expect(within(widget('Life')).getByText(/Nothing stocked yet/)).toBeTruthy();
  });

  it('collapses every device that is off into one row, and powers one that is on', () => {
    const run = stocked();
    const sim = renderOverview(run);
    const gear = within(widget('Gear'));
    const off = DEVICES.filter((id) => !run.state.equipment[id].enabled);

    expect(gear.getByText('Others')).toBeTruthy();
    expect(gear.getAllByRole('switch')).toHaveLength(DEVICES.length - off.length);
    for (const id of off) expect(gear.queryByRole('switch', { name: NAMES[id] })).toBeNull();

    fireEvent.click(gear.getByRole('switch', { name: 'Filter power' }));
    expect(sim.updateFilterEnabled).toHaveBeenCalledWith(false);
  });

  it('reads the plant foods against what the plants ask for', () => {
    renderOverview(stocked());
    const nutrients = within(widget('Nutrients'));

    expect(nutrients.getAllByText(/^need /)).toHaveLength(4);
    expect(nutrients.getByText(/1 ml moves/)).toBeTruthy();
  });

  it('says nothing is asking for the nutrients when nothing is planted', () => {
    renderOverview(bare());
    const nutrients = within(widget('Nutrients'));

    expect(nutrients.getByText('no plants to feed')).toBeTruthy();
    expect(nutrients.queryByText(/^need /)).toBeNull();
  });
});
