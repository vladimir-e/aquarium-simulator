import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { WaterSection } from './WaterSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState } from '../run/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

function day0(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

/** Nine days of a stocked, fed tank: AOB established, NOB still behind. */
function cycling(): SimulationState {
  let state = day0();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  for (let hour = 0; hour < 24 * 9; hour++) {
    if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 0.5 }).state;
    state = tick(state, DEFAULT_CONFIG);
  }
  return state;
}

function renderWater(state: SimulationState): void {
  const sim = {
    state,
    history: [snapshotFromState(state)],
  } as unknown as ReturnType<typeof useSimulation>;

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
    expect(screen.getByText('colonisation 0 %')).toBeTruthy();
    expect(screen.getByText('0.00 g standing')).toBeTruthy();
    expect(screen.getByText(/Uncycled\./)).toBeTruthy();
    expect(screen.getByText(/No nitrite peak within|Nitrite peaks in/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/add fish|go to|get started/i);
  });

  it('names every waste source, ambient included, on an empty tank', () => {
    renderWater(day0());
    for (const label of ['Food decay', 'Fish', 'Plants', 'Ambient']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('100 % ambient')).toBeTruthy();
  });

  it('shows both colonies against the same ceiling', () => {
    renderWater(cycling());
    const ceiling = screen.getByText(/^ceiling /).textContent ?? '';
    expect(ceiling).toMatch(/cm² biofilm/);
    expect(screen.getByText('AOB')).toBeTruthy();
    expect(screen.getByText('NOB')).toBeTruthy();
  });

  it('flags the section with the same reading the gauges carry', () => {
    const state = day0();
    state.resources.ammonia = state.resources.water * 4;
    renderWater(state);

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText('NH₃ high')).toBeTruthy();
    expect(screen.getByText('HIGH')).toBeTruthy();
  });

  it('says the tank is uncycled when nothing else is wrong', () => {
    const state = day0();
    state.resources.nitrate = state.resources.water * 12;
    renderWater(state);
    expect(screen.getByText('uncycled')).toBeTruthy();
  });
});
