import { useEffect } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { LivestockSection } from './LivestockSection';
import { UnitsProvider, useUnits, type UnitSystem } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  createSimulation,
  type Action,
  type Clutch,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { navFigures, type NavFigure } from '../nav/figures';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

/** The reader's units come from their locale, so a units-sensitive test names one. */
function ForceUnits({ system }: { system: UnitSystem }): null {
  const { unitSystem, setUnitSystem } = useUnits();
  useEffect(() => {
    if (unitSystem !== system) setUnitSystem(system);
  }, [system, unitSystem, setUnitSystem]);
  return null;
}

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

function tank(fish: Fish[] = [], clutches: Clutch[] = [], tick = 0): SimulationState {
  return { ...createSimulation({ tankCapacity: 200 }), fish, clutches, tick };
}

function renderRoster(state: SimulationState, units: UnitSystem = 'metric'): Action[] {
  const actions: Action[] = [];
  const sim = {
    state,
    executeAction: (action: Action) => actions.push(action),
  } as unknown as ReturnType<typeof useSimulation>;

  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ForceUnits system={units} />
        <LivestockSection sim={sim} config={DEFAULT_CONFIG} />
      </UnitsProvider>
    </PersistenceProvider>
  );
  return actions;
}

/** Two species that differ on mass, age, satiation and condition. */
function community(): Fish[] {
  return [
    makeFish({ id: 'fish_a_1', mass: 0.4, age: 24 * 10, health: 90, satiation: 80 }),
    makeFish({ id: 'fish_a_2', mass: 0.9, age: 24 * 20, health: 60, satiation: 40, sex: 'female' }),
    makeFish({ id: 'fish_a_3', species: 'corydoras', mass: 4, age: 24 * 62, health: 74 }),
  ];
}

describe('LivestockSection', () => {
  it('opens on species rows carrying the group’s own figures', () => {
    renderRoster(tank(community()));

    const neon = screen.getByRole('button', { name: 'Neon Tetra — 2 fish' }).closest('tr')!;
    // Two neons of 0.4 g and 0.9 g, aged 10 d and 20 d: mass sums, age averages.
    expect(within(neon).getByText('1.30 g')).toBeTruthy();
    expect(within(neon).getByText('15 d')).toBeTruthy();
    // Satiation 80 and 40 average to 60; one of them is in the hungry band.
    expect(within(neon).getByText('1 hungry')).toBeTruthy();
    expect(within(neon).getByText('60 %')).toBeTruthy();
    // Condition 90 and 60 average to 75.
    expect(within(neon).getByText('75 %')).toBeTruthy();
  });

  it('expands a species into its individuals and removes one by id', () => {
    const actions = renderRoster(tank(community()));

    expect(screen.queryByText('a_2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra — 2 fish' }));

    const row = screen.getByText('a_2').closest('tr')!;
    expect(within(row).getByText('♀')).toBeTruthy();
    expect(within(row).getByText('0.90 g')).toBeTruthy();
    expect(within(row).getByText('20 d')).toBeTruthy();
    expect(within(row).getByText('hungry')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Neon Tetra a_2' }));
    expect(actions).toEqual([{ type: 'removeFish', fishId: 'fish_a_2' }]);
  });

  it('gives a clutch its hatch tick and the hours left from now', () => {
    const clutch: Clutch = {
      id: 'clutch_x_7',
      species: 'angelfish', // hatchTime 60
      eggCount: 24,
      laidTick: 1602,
    };
    renderRoster(tank([], [clutch], 1622));

    const row = screen.getByText('Angelfish clutch').closest('tr')!;
    expect(within(row).getByText('24 eggs')).toBeTruthy();
    expect(within(row).getByText('laid T1602')).toBeTruthy();
    expect(within(row).getByText('hatches T1662 · in 40 h')).toBeTruthy();
  });

  it('gives a fry batch its maturation and a tank-wide sell control', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 * 6, mass: 0.4 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 24 * 12, mass: 0.6 }),
    ];
    const actions = renderRoster(tank(fish));

    const row = screen.getByText(/Guppy fry/).closest('tr')!;
    expect(within(row).getByText('×2')).toBeTruthy();
    expect(within(row).getByText('1.00 g')).toBeTruthy();
    // guppy maturityAge = 24 * 60 → day 9 of 60, 15 % grown.
    expect(within(row).getByText('day 9 of 60')).toBeTruthy();
    expect(within(row).getByText('15 %')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sell every fry in the tank' }));
    expect(actions).toEqual([{ type: 'sellFry' }]);
  });

  it('reads bioload as a guideline, with the arithmetic that produced it', () => {
    renderRoster(tank(community()));

    // 2 neon (1 g projected) + 1 cory (4 g) = 5 g against a 120 g guideline.
    expect(screen.getByText('0.0×')).toBeTruthy();
    expect(screen.getByText('vs guideline')).toBeTruthy();
    expect(
      screen.getByText('5.0 g projected adult mass · guideline 120 g at 0.6 g/L')
    ).toBeTruthy();
  });

  it('states the guideline density in the reader’s own volume unit', () => {
    renderRoster(tank(community()), 'imperial');
    expect(
      screen.getByText('5.0 g projected adult mass · guideline 120 g at 2.3 g/gal')
    ).toBeTruthy();
  });

  it('offers each species with what it adds, and says who assigns sex', () => {
    const actions = renderRoster(tank(community()));

    fireEvent.click(screen.getByRole('button', { name: 'Add fish' }));
    const angelfish = screen.getByRole('menuitem', { name: /Angelfish/ });
    expect(within(angelfish).getByText('0 in tank · +15 g')).toBeTruthy();
    expect(
      within(angelfish.parentElement!).getByText(/Sex is random — the breeding engine assigns it/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /Corydoras/ }));
    expect(actions).toEqual([{ type: 'addFish', species: 'corydoras' }]);
  });

  it('feeds the tank at the amount on the button', () => {
    const actions = renderRoster(tank(community()));

    fireEvent.click(screen.getByRole('button', { name: 'Feed 0.5 grams' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose amount' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '2 g' }));

    expect(actions).toEqual([
      { type: 'feed', amount: 0.5 },
      { type: 'feed', amount: 2 },
    ]);
    expect(screen.getByRole('button', { name: 'Feed 2 grams' })).toBeTruthy();
  });

  it('invites the first fish instead of pointing somewhere else', () => {
    renderRoster(tank());

    expect(screen.getByText('No fish yet — add one to begin.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add fish' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/from Stocking|in Build|go to/i);
  });

  it('states the roster in the stage header', () => {
    const fish = [
      ...community(),
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
    ];
    const clutch: Clutch = { id: 'c1', species: 'neon_tetra', eggCount: 25, laidTick: 0 };
    renderRoster(tank(fish, [clutch], 4));

    const header = screen.getByRole('heading', { level: 1, name: 'Livestock' }).parentElement!;
    expect(within(header).getByText('3 fish · 3 species · 1 clutch · 1 fry')).toBeTruthy();
  });
});

/**
 * The rail exists so the reader need not open the section — which only holds if
 * the two never disagree. This renders the section and reads the rail's own
 * figure against it, on a tank carrying every kind of row at once.
 */
describe('the rail carries the Livestock section’s own roster', () => {
  function stocked(): SimulationState {
    const fish = [
      ...community(),
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 * 4 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 24 * 8 }),
    ];
    const clutches: Clutch[] = [
      { id: 'c1', species: 'neon_tetra', eggCount: 25, laidTick: 0 },
      { id: 'c2', species: 'angelfish', eggCount: 40, laidTick: 6 },
    ];
    return tank(fish, clutches, 12);
  }

  function railFigure(state: SimulationState): NavFigure {
    return navFigures({
      state,
      config: DEFAULT_CONFIG,
      presetName: 'Planted Tank',
      units: 'metric',
      alerts: 0,
      deaths: 0,
      births: 0,
    }).livestock;
  }

  it('prints the rail’s roster line verbatim in the stage header', () => {
    const state = stocked();
    renderRoster(state);

    const header = screen.getByRole('heading', { level: 1, name: 'Livestock' }).parentElement!;
    expect(railFigure(state).lines[0]).toBe('3 fish · 3 species · 2 clutches · 2 fry');
    expect(within(header).getByText(railFigure(state).lines[0])).toBeTruthy();
  });

  it('reads the same bioload figure the pinned foot does', () => {
    const state = stocked();
    renderRoster(state);

    // Both must land on the engine's own ratio for this stocking, to one decimal.
    expect(railFigure(state).lines[1]).toBe('bioload 0.1× vs guideline');
    expect(screen.getByText('0.1×')).toBeTruthy();
  });

  it('raises the hungry pill on the same fish the table calls hungry', () => {
    const state = stocked();
    renderRoster(state);

    // One of the three adults sits at satiation 40, inside the hungry band.
    expect(railFigure(state).pill).toEqual({ text: '1 hungry', status: 'warn' });
    expect(screen.getByText('1 hungry')).toBeTruthy();
  });
});
