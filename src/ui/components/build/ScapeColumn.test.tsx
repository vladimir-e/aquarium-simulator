import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ScapeColumn } from './ScapeColumn';
import { createSimulation, type Plant, type SimulationState } from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 40 }); // substrate 'none' by default

function stubSim(state: SimulationState = base): {
  sim: ReturnType<typeof useSimulation>;
  executeAction: ReturnType<typeof vi.fn>;
  updateSubstrateType: ReturnType<typeof vi.fn>;
} {
  const cbs = {
    executeAction: vi.fn(),
    updateSubstrateType: vi.fn(),
    addHardscapeItem: vi.fn(),
    removeHardscapeItem: vi.fn(),
  };
  const sim = { state, ...cbs } as unknown as ReturnType<typeof useSimulation>;
  return { sim, executeAction: cbs.executeAction, updateSubstrateType: cbs.updateSubstrateType };
}

function renderScape(sim: ReturnType<typeof useSimulation>): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ScapeColumn sim={sim} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('ScapeColumn', () => {
  it('changes the substrate through its select', () => {
    const { sim, updateSubstrateType } = stubSim();
    renderScape(sim);
    fireEvent.change(screen.getByRole('combobox', { name: 'Substrate' }), {
      target: { value: 'aqua_soil' },
    });
    expect(updateSubstrateType).toHaveBeenCalledWith('aqua_soil');
  });

  it('gates rooted species by substrate in the plant picker', () => {
    renderScape(stubSim().sim); // bare bottom
    const select = screen.getByRole('combobox', { name: 'Plant species to add' });
    const amazon = within(select).getByRole('option', { name: /Amazon Sword/ });
    const javaFern = within(select).getByRole('option', { name: 'Java Fern' });
    expect(amazon.hasAttribute('disabled')).toBe(true); // needs sand+ — gated off a bare bottom
    expect(javaFern.hasAttribute('disabled')).toBe(false); // epiphyte — always plantable
  });

  it('adds the selected compatible species', () => {
    const { sim, executeAction } = stubSim();
    renderScape(sim);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(executeAction).toHaveBeenCalledWith({ type: 'addPlant', species: 'java_fern' });
  });

  it('disables Add once the tank is at plant capacity', () => {
    // getMaxPlants(40) = 6.
    const plants: Plant[] = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      species: 'java_fern',
      size: 50,
      condition: 100,
      surplus: 0,
    }));
    const { sim } = stubSim({ ...base, plants });
    renderScape(sim);
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
