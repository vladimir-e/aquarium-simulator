import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SystemsCard } from './SystemsCard';
import { createSimulation, type SimulationState } from '../../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function renderCard(
  state: SimulationState,
  handlers: { executeAction?: (...a: unknown[]) => void; onOpen?: (id: string) => void } = {}
): { executeAction: (...a: unknown[]) => void; onOpen: (id: string) => void } {
  const executeAction = handlers.executeAction ?? vi.fn();
  const onOpen = handlers.onOpen ?? vi.fn();
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <SystemsCard
          state={state}
          config={DEFAULT_CONFIG}
          executeAction={executeAction as never}
          onOpenDeviceInBuild={onOpen as never}
        />
      </UnitsProvider>
    </PersistenceProvider>
  );
  return { executeAction, onOpen };
}

describe('SystemsCard', () => {
  it('renders device rows, the filter flow, and the biofilter glance', () => {
    renderCard(base);
    expect(screen.getByText('Filter')).toBeTruthy();
    expect(screen.getByText('Heater')).toBeTruthy();
    expect(screen.getByText('Biofilter')).toBeTruthy();
    expect(screen.getByText(/GPH/)).toBeTruthy();
  });

  it('carries a device id into Build when its row is tapped', () => {
    const { onOpen } = renderCard(base);
    fireEvent.click(screen.getByText('Filter'));
    expect(onOpen).toHaveBeenCalledWith('filter');
  });

  it('dispatches the chosen water-change amount', () => {
    const { executeAction } = renderCard(base);
    fireEvent.click(screen.getByText('Water Δ 25%'));
    fireEvent.click(screen.getByText('50%'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'waterChange', amount: 0.5 });
  });

  it('disables Top-off when the tank is full', () => {
    // createSimulation fills the tank to capacity.
    renderCard(base);
    expect((screen.getByText('Top-off') as HTMLButtonElement).disabled).toBe(true);
  });

  it('pins biofilter colonization to the AOB+NOB formula', () => {
    // maxBacteria = surface × bacteriaPerCm2 (0.01) = 10 per type; ceiling is 2×.
    // (aob + nob) = 10 of 20 → 50%.
    const state: SimulationState = {
      ...base,
      resources: { ...base.resources, surface: 1000, aob: 5, nob: 5 },
    };
    renderCard(state);
    expect(screen.getByText('50% · 1,000 cm²')).toBeTruthy();
  });
});
