import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StockingColumn } from './StockingColumn';
import { createSimulation, type Fish, type SimulationState } from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';

afterEach(cleanup);

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function stubSim(fish: Fish[]): {
  sim: ReturnType<typeof useSimulation>;
  executeAction: ReturnType<typeof vi.fn>;
} {
  const state: SimulationState = { ...createSimulation({ tankCapacity: 40 }), fish };
  const executeAction = vi.fn();
  const sim = { state, executeAction } as unknown as ReturnType<typeof useSimulation>;
  return { sim, executeAction };
}

describe('StockingColumn', () => {
  it('renders a per-species row with its adult count', () => {
    const { sim } = stubSim([
      makeFish({ id: 'a', species: 'neon_tetra' }),
      makeFish({ id: 'b', species: 'neon_tetra' }),
    ]);
    render(<StockingColumn sim={sim} onResumeRun={vi.fn()} />);
    // Its stepper group is labelled by the species (the name also appears as a
    // <select> option, so target the row's control instead).
    expect(screen.getByRole('group', { name: 'Neon Tetra' })).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
  });

  it('adds a fish of the species when the row + is pressed', () => {
    const { sim, executeAction } = stubSim([makeFish({ id: 'a', species: 'guppy' })]);
    render(<StockingColumn sim={sim} onResumeRun={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Guppy' }));
    expect(executeAction).toHaveBeenCalledWith({ type: 'addFish', species: 'guppy' });
  });

  it('culls the lowest-health adult when the row − is pressed', () => {
    const { sim, executeAction } = stubSim([
      makeFish({ id: 'strong', species: 'neon_tetra', health: 80 }),
      makeFish({ id: 'weak', species: 'neon_tetra', health: 20 }),
    ]);
    render(<StockingColumn sim={sim} onResumeRun={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Neon Tetra' }));
    expect(executeAction).toHaveBeenCalledWith({ type: 'removeFish', fishId: 'weak' });
  });

  it('disables adding once the tank hits its physical fish ceiling', () => {
    // getMaxFishMass(40) = 20000 g; one fish at the ceiling blocks another.
    const { sim } = stubSim([makeFish({ id: 'whale', species: 'neon_tetra', mass: 20000 })]);
    render(<StockingColumn sim={sim} onResumeRun={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Add Neon Tetra' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('resumes the run from the footer button', () => {
    const { sim } = stubSim([]);
    const onResumeRun = vi.fn();
    render(<StockingColumn sim={sim} onResumeRun={onResumeRun} />);
    fireEvent.click(screen.getByRole('button', { name: /Resume run/ }));
    expect(onResumeRun).toHaveBeenCalledTimes(1);
  });
});
