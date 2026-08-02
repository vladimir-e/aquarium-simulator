import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { WaterSection } from './WaterSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState, type RunSnapshot } from '../run/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

/** A tank and the run behind it — captions read the history, not just the state. */
interface Run {
  state: SimulationState;
  history: RunSnapshot[];
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

/** A tank as the app first shows it: one snapshot, nothing to trend against yet. */
function day0(state: SimulationState = tank()): Run {
  return { state, history: [snapshotFromState(state)] };
}

/** Nine days of a stocked, fed tank: AOB established, NOB still behind. */
function cycling(): Run {
  let state = tank();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  const history = [snapshotFromState(state)];
  for (let hour = 0; hour < 24 * 9; hour++) {
    if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 0.5 }).state;
    state = tick(state, DEFAULT_CONFIG);
    history.push(snapshotFromState(state));
  }
  return { state, history };
}

function renderWater({ state, history }: Run): void {
  const sim = { state, history } as unknown as ReturnType<typeof useSimulation>;

  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <WaterSection sim={sim} config={DEFAULT_CONFIG} />
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

describe('WaterSection', () => {
  it('mounts six gauges in two groups, plus Bacteria and Waste', () => {
    renderWater(cycling());

    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(['Water', 'Nitrogen cycle', 'Bacteria', 'Waste']);

    for (const name of ['Temp', 'pH', 'Level', 'NH₃', 'NO₂', 'NO₃']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('reads as an instrument at day 0 rather than pointing somewhere else', () => {
    renderWater(day0());
    expect(screen.getByText(/ · ATO (on|off)$/)).toBeTruthy();
    expect(screen.getByText(/^heater holds /)).toBeTruthy();
    const bacteria = screen.getByRole('heading', { level: 2, name: 'Bacteria' }).parentElement!;
    expect(within(bacteria).getByText('uncycled')).toBeTruthy();
    expect(screen.getByText('0.00 g standing')).toBeTruthy();
    expect(screen.getByText(/Uncycled\./)).toBeTruthy();
    expect(screen.getByText(/No nitrite peak within|Nitrite peaks in/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/add fish|go to|get started/i);
  });

  it('names every waste source, substrate included, on an unstocked soil tank', () => {
    renderWater(day0(createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } })));
    for (const label of ['Food decay', 'Fish', 'Plants', 'Substrate']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('100 % substrate')).toBeTruthy();
  });

  it('shows both colonies against the same ceiling', () => {
    renderWater(cycling());
    const ceiling = screen.getByText(/^ceiling /).textContent ?? '';
    expect(ceiling).toMatch(/cm² biofilm/);
    expect(screen.getByText('AOB')).toBeTruthy();
    expect(screen.getByText('NOB')).toBeTruthy();
  });

  it('flags the section with the same reading the gauges carry', () => {
    const state = tank();
    state.resources.ammonia = state.resources.water * 4;
    renderWater(day0(state));

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText('NH₃ high')).toBeTruthy();
    expect(screen.getByText('HIGH')).toBeTruthy();
  });

  it('says the tank is uncycled when nothing else is wrong', () => {
    const state = tank();
    state.resources.nitrate = state.resources.water * 12;
    renderWater(day0(state));

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText('uncycled')).toBeTruthy();
  });

  it('reads both dissolved gases without leaving the section', () => {
    const state = tank();
    state.resources.oxygen = 7.2;
    state.resources.co2 = 12.4;
    renderWater(day0(state));

    // The pair sits with the tank-condition gauges, not the nitrogen cycle.
    const water = screen.getByRole('heading', { level: 2, name: 'Water' }).parentElement!;
    expect(within(water).getByText('O₂')).toBeTruthy();
    expect(within(water).getByText('7.2')).toBeTruthy();
    expect(within(water).getByText('CO₂')).toBeTruthy();
    expect(within(water).getByText('12.4')).toBeTruthy();
    expect(within(water).getAllByText('mg/L')).toHaveLength(2);
  });

  it('marks oxygen low right where the reading is', () => {
    const state = tank();
    state.resources.oxygen = 3;
    renderWater(day0(state));

    const water = screen.getByRole('heading', { level: 2, name: 'Water' }).parentElement!;
    expect(within(water).getByText('LOW')).toBeTruthy();
  });

  it('carries a gas past its threshold up to the section header', () => {
    // CO₂ over 30 mg/L is an alert, so it outranks the day-0 “uncycled” note.
    const state = tank();
    state.resources.co2 = 45;
    renderWater(day0(state));

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText('CO₂ high')).toBeTruthy();
  });

  it('says nothing about gases the fish are comfortable in', () => {
    const state = tank();
    state.resources.oxygen = 7;
    state.resources.co2 = 12;
    renderWater(day0(state));

    const water = screen.getByRole('heading', { level: 2, name: 'Water' }).parentElement!;
    expect(within(water).queryByText('LOW')).toBeNull();
    expect(within(water).queryByText('HIGH')).toBeNull();

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText('uncycled')).toBeTruthy();
  });

  it('captions each toxin with which way it is moving, once a run has history', () => {
    const moving = / · (steady|[+−][\d.]+\/h)$/;

    renderWater(day0());
    expect(screen.queryAllByText(moving)).toHaveLength(0);

    cleanup();
    renderWater(cycling());
    expect(screen.getAllByText(moving)).toHaveLength(3);
  });
});
