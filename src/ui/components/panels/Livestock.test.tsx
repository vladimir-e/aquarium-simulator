import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Livestock } from './Livestock';
import {
  createSimulation,
  type Fish,
  type Clutch,
  type SimulationState,
} from '../../../simulation/index.js';
import { livestockDefaults } from '../../../simulation/config/livestock.js';

afterEach(cleanup);

const baseState: SimulationState = createSimulation({ tankCapacity: 100 });

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 70,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

interface RenderOverrides {
  fish?: Fish[];
  clutches?: Clutch[];
  tankCapacity?: number;
  tick?: number;
  resourcesTemperature?: number;
  executeAction?: (...args: unknown[]) => void;
}

function renderPanel(overrides: RenderOverrides = {}): (...args: unknown[]) => void {
  const executeAction = overrides.executeAction ?? vi.fn();
  const resources = {
    ...baseState.resources,
    temperature: overrides.resourcesTemperature ?? baseState.resources.temperature,
  };
  render(
    <Livestock
      food={1}
      fish={overrides.fish ?? []}
      clutches={overrides.clutches ?? []}
      plants={baseState.plants}
      resources={resources}
      tankCapacity={overrides.tankCapacity ?? 100}
      tick={overrides.tick ?? 0}
      livestockConfig={livestockDefaults}
      executeAction={executeAction as never}
    />
  );
  return executeAction;
}

describe('Livestock panel — fry', () => {
  it('badges a fry and shows its growth toward adult mass', () => {
    const maturity = 60 * 24;
    renderPanel({
      fish: [makeFish({ id: 'f1', species: 'guppy', mass: 0.5, age: maturity / 2, stage: 'fry' })],
    });
    expect(screen.getByText('Fry')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('0.50g')).toBeTruthy();
  });

  it('shows no Fry badge or growth row for an adult', () => {
    renderPanel({ fish: [makeFish({ id: 'a1', stage: 'adult' })] });
    expect(screen.queryByText('Fry')).toBeNull();
    expect(screen.queryByText('Growth')).toBeNull();
  });
});

describe('Livestock panel — reserve', () => {
  it('renders the reserve value for each fish', () => {
    renderPanel({ fish: [makeFish({ id: 'a1', surplus: 30 })] });
    expect(screen.getByText('Reserve')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });

  it('flags burning reserves when full health drains the bank', () => {
    // Full health + banked reserve in lethally cold water → net < 0,
    // the bank drains to hold health, and the card reads "Burning reserves".
    renderPanel({
      fish: [makeFish({ id: 'a1', health: 100, surplus: 40 })],
      resourcesTemperature: 5,
    });
    expect(screen.getByText('Burning reserves')).toBeTruthy();
  });

  it('does not flag burning reserves in good conditions', () => {
    renderPanel({ fish: [makeFish({ id: 'a1', health: 100, surplus: 40 })] });
    expect(screen.queryByText('Burning reserves')).toBeNull();
  });
});

describe('Livestock panel — clutches', () => {
  it('lists a clutch with species, egg count, and hatch countdown', () => {
    renderPanel({
      clutches: [{ id: 'c1', species: 'neon_tetra', eggCount: 25, laidTick: 10 }],
      tick: 20, // neon hatchTime 24 → hatches at 34, 14 ticks out
    });
    expect(screen.getByText('Neon Tetra clutch')).toBeTruthy();
    expect(screen.getByText('25 eggs')).toBeTruthy();
    expect(screen.getByText('hatches in 14h')).toBeTruthy();
  });

  it('renders no clutch section when there are none', () => {
    renderPanel({ clutches: [] });
    expect(screen.queryByText(/Clutches/)).toBeNull();
  });
});

describe('Livestock panel — sell fry', () => {
  it('offers a sell-fry control only when fry are present', () => {
    renderPanel({ fish: [makeFish({ id: 'a1', stage: 'adult' })] });
    expect(screen.queryByText(/Sell fry/)).toBeNull();
  });

  it('dispatches sellFry when the control is clicked', () => {
    const executeAction = vi.fn();
    renderPanel({
      fish: [
        makeFish({ id: 'a1', stage: 'adult' }),
        makeFish({ id: 'f1', stage: 'fry', mass: 0.1 }),
      ],
      executeAction,
    });
    fireEvent.click(screen.getByText('Sell fry (1)'));
    expect(executeAction).toHaveBeenCalledWith({ type: 'sellFry' });
  });
});

describe('Livestock panel — stocking cap', () => {
  it('disables Add and warns when the tank is at physical capacity', () => {
    // 0.0005 L → 0.25 g ceiling; even one neon tetra (0.5 g) can't fit.
    renderPanel({ tankCapacity: 0.0005 });
    const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(screen.getByText(/Tank at fish capacity/)).toBeTruthy();
  });

  it('allows Add with room to spare', () => {
    const executeAction = vi.fn();
    renderPanel({ executeAction });
    const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(false);
    fireEvent.click(addButton);
    expect(executeAction).toHaveBeenCalledWith({ type: 'addFish', species: 'neon_tetra' });
  });
});
