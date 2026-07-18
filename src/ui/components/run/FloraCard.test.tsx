import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FloraCard } from './FloraCard';
import { createSimulation, type Plant, type SimulationState } from '../../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function plant(id: string, size: number): Plant {
  return { id, species: 'java_fern', size, condition: 80, surplus: 0 };
}

function makeState(overrides: { plants?: Plant[]; algaeMass?: number } = {}): SimulationState {
  return {
    ...base,
    plants: overrides.plants ?? [plant('p1', 120)],
    algae: { ...base.algae, mass: overrides.algaeMass ?? 0 },
  };
}

function renderCard(state: SimulationState, executeAction = vi.fn()): (...a: unknown[]) => void {
  render(<FloraCard state={state} config={DEFAULT_CONFIG} executeAction={executeAction as never} />);
  return executeAction;
}

describe('FloraCard', () => {
  it('renders plant rows, nutrient chips, and the scape summary', () => {
    renderCard(makeState());
    expect(screen.getByText('Java Fern')).toBeTruthy();
    expect(screen.getByText('NO₃')).toBeTruthy();
    expect(screen.getByText('Fe')).toBeTruthy();
    expect(screen.getByText('Scape')).toBeTruthy();
  });

  it('previews trim counts and dispatches a trim', () => {
    const executeAction = renderCard(makeState({ plants: [plant('p1', 120)] }));
    fireEvent.click(screen.getByText('Trim'));
    // one plant is above every target
    expect(screen.getByText('trim to 100%')).toBeTruthy();
    fireEvent.click(screen.getByText('trim to 100%'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'trimPlants', targetSize: 100 });
  });

  it('gates Scrub on the algae threshold', () => {
    renderCard(makeState({ algaeMass: 0 }));
    expect((screen.getByText('Scrub') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderCard(makeState({ algaeMass: 20 }));
    expect((screen.getByText('Scrub') as HTMLButtonElement).disabled).toBe(false);
  });

  it('dispatches a dose from the menu', () => {
    const executeAction = renderCard(makeState());
    fireEvent.click(screen.getByText('Dose'));
    fireEvent.click(screen.getByText('2 ml'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'dose', amountMl: 2 });
  });

  it('removes a plant from its expanded row', () => {
    const executeAction = renderCard(makeState({ plants: [plant('p1', 120)] }));
    fireEvent.click(screen.getByText('Java Fern'));
    fireEvent.click(screen.getByLabelText('Remove Java Fern'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'removePlant', plantId: 'p1' });
  });
});
