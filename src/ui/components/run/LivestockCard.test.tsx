import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LivestockCard } from './LivestockCard';
import {
  createSimulation,
  type Fish,
  type SimulationState,
} from '../../../simulation/index.js';
import { livestockDefaults } from '../../../simulation/config/livestock.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 100 });

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

function makeState(fish: Fish[], food = 1): SimulationState {
  return { ...base, fish, resources: { ...base.resources, food } };
}

function renderCard(fish: Fish[], executeAction = vi.fn()): (...args: unknown[]) => void {
  render(
    <LivestockCard
      state={makeState(fish)}
      config={livestockDefaults}
      executeAction={executeAction as never}
    />
  );
  return executeAction;
}

describe('LivestockCard — species grouping', () => {
  it('renders a species row and feeds at the shown amount', () => {
    const executeAction = renderCard([makeFish({ id: 'n1' })]);
    expect(screen.getByText('Neon Tetra')).toBeTruthy();
    fireEvent.click(screen.getByText('Feed 0.5g'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'feed', amount: 0.5 });
  });

  it('surfaces a hungry tally in the header when fish are hungry', () => {
    renderCard([makeFish({ id: 'n1', satiation: 40 })]);
    expect(screen.getAllByText('1 hungry').length).toBeGreaterThan(0);
  });
});

describe('LivestockCard — fry batch', () => {
  it('shows a fry batch with maturation and a sell control', () => {
    const executeAction = renderCard([
      makeFish({ id: 'a1', species: 'guppy' }),
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 24 }),
    ]);
    expect(screen.getByText('Guppy fry')).toBeTruthy();
    // guppy maturityAge = 24 * 60 → graduates day 60
    expect(screen.getByText(/graduates d60/)).toBeTruthy();
    fireEvent.click(screen.getByText('sell'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'sellFry' });
  });
});

describe('LivestockCard — flat individuals', () => {
  it('lists each fish flat and removes on demand', () => {
    const executeAction = renderCard([makeFish({ id: 'n1' })]);
    fireEvent.change(screen.getByLabelText('Group livestock'), {
      target: { value: 'individuals' },
    });
    fireEvent.click(screen.getByLabelText('Remove Neon Tetra'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'removeFish', fishId: 'n1' });
  });
});
