import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ScenarioColumn } from './ScenarioColumn';
import { createSimulation } from '../../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

afterEach(cleanup);

function stubSim(): {
  sim: ReturnType<typeof useSimulation>;
  changeTankCapacity: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} {
  const state = createSimulation({ tankCapacity: 40 });
  const cbs = {
    loadPreset: vi.fn(),
    changeTankCapacity: vi.fn(),
    updateLidType: vi.fn(),
    updateRoomTemperature: vi.fn(),
    updateTapWaterTemperature: vi.fn(),
    updateTapWaterPH: vi.fn(),
    reset: vi.fn(),
  };
  const sim = { state, currentPreset: 'planted', ...cbs } as unknown as ReturnType<typeof useSimulation>;
  return { sim, changeTankCapacity: cbs.changeTankCapacity, reset: cbs.reset };
}

function renderScenario(sim: ReturnType<typeof useSimulation>): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ScenarioColumn sim={sim} config={DEFAULT_CONFIG} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('ScenarioColumn', () => {
  it('flips the display units via the L/°C ↔ gal/°F toggle', () => {
    renderScenario(stubSim().sim);
    fireEvent.click(screen.getByRole('button', { name: 'gal/°F' }));
    expect(screen.getAllByText(/°F/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'L/°C' }));
    expect(screen.getAllByText(/°C/).length).toBeGreaterThan(0);
  });

  it('changes tank capacity through the tank-size select', () => {
    const { sim, changeTankCapacity } = stubSim();
    renderScenario(sim);
    const select = screen.getByRole('combobox', { name: 'Tank size' }) as HTMLSelectElement;
    const options = within(select).getAllByRole('option');
    const target = options.find((o) => o.getAttribute('value') !== select.value);
    expect(target).toBeDefined();
    const value = target!.getAttribute('value') as string;
    fireEvent.change(select, { target: { value } });
    expect(changeTankCapacity).toHaveBeenCalledWith(Number(value));
  });

  it('resets only after the confirmation is accepted', () => {
    const { sim, reset } = stubSim();
    renderScenario(sim);

    fireEvent.click(screen.getByRole('button', { name: /Reset run/ }));
    expect(screen.getByText('Reset run?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Reset run/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
