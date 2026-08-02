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
import { emptyAggregates } from '../run/index.js';

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

/** How far the one bar inside `container` is filled. */
function fill(container: HTMLElement): string {
  const bar = container.querySelector<HTMLElement>('[style*="width"]');
  if (!bar) throw new Error('no bar to measure');
  return bar.style.width;
}

/** The same tank with enough ammonia in it to put every fish at a losing net rate. */
function poisoned(state: SimulationState, ppm: number): SimulationState {
  return { ...state, resources: { ...state.resources, ammonia: ppm * state.resources.water } };
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

  it('answers why a fish is where it is, the way the plant card does', () => {
    const state = poisoned(tank([makeFish({ id: 'fish_a_1', health: 100, surplus: 5 })]), 20);
    renderRoster(state);
    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra — 1 fish' }));

    // Nothing is claimed until the fish itself is opened.
    expect(screen.queryByText('net')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra a_1 — conditions' }));

    expect(screen.getByText('Free NH3')).toBeTruthy();
    expect(screen.getByText('Oxygen')).toBeTruthy();
    const net = screen.getByText('net').parentElement!;
    expect(net.className).toContain('text-alert');
    expect(within(net).getByText(/^−\d+\.\d\d %\/h$/)).toBeTruthy();
  });

  it('shows the bank a full fish is spending, and says it is spending it', () => {
    const state = poisoned(tank([makeFish({ id: 'fish_a_1', health: 100, surplus: 5 })]), 20);
    renderRoster(state);
    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra — 1 fish' }));

    // The species row already reads amber at 100 %, before anything is opened.
    const group = screen.getByRole('button', { name: 'Neon Tetra — 1 fish' }).closest('tr')!;
    expect(within(group).getByText('100 %')).toBeTruthy();
    expect(within(group).getByText('burning').className).toContain('text-warn');

    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra a_1 — conditions' }));
    expect(screen.getByText('Burning reserves')).toBeTruthy();
    // surplusCap is 50 at default calibration, and the fish went in holding 5.
    const row = screen.getByText('5.0 / 50').parentElement!;
    expect(fill(row)).toBe('10%');
  });

  it('leaves a fish that is genuinely thriving at 100 alone', () => {
    renderRoster(tank([makeFish({ id: 'fish_a_1', health: 100, surplus: 5 })]));

    const group = screen.getByRole('button', { name: 'Neon Tetra — 1 fish' }).closest('tr')!;
    expect(within(group).getByText('100 %')).toBeTruthy();
    expect(within(group).queryByText('burning')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra — 1 fish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra a_1 — conditions' }));
    expect(screen.getByText('Reserve')).toBeTruthy();
    expect(screen.queryByText('Burning reserves')).toBeNull();
  });

  it('gives a clutch its hatch tick and the hours left from now', () => {
    const clutch: Clutch = {
      id: 'clutch_x_7',
      species: 'angelfish', // hatchTime 60
      eggCount: 24,
      laidTick: 1602,
    };
    renderRoster(tank([], [clutch], 1622));

    const row = screen.getByText(/Angelfish clutch/).closest('tr')!;
    expect(within(row).getByText('24 eggs')).toBeTruthy();
    expect(within(row).getByText('hatches T1662 · in 40 h')).toBeTruthy();
    // Eggs have no mass, age or satiation — the row leaves those columns alone.
    expect(within(row).queryByText(/ g$/)).toBeNull();
    expect(within(row).queryByText(/%/)).toBeNull();
  });

  it('gives a fry batch its maturation, its satiation and its condition', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 * 6, mass: 0.4, satiation: 20 }),
      makeFish({
        id: 'f2',
        species: 'guppy',
        stage: 'fry',
        age: 24 * 12,
        mass: 0.6,
        satiation: 60,
        health: 50,
      }),
    ];
    renderRoster(tank(fish));

    const row = screen.getByText(/Guppy fry/).closest('tr')!;
    expect(within(row).getByText('×2')).toBeTruthy();
    expect(within(row).getByText('1.00 g')).toBeTruthy();
    // guppy maturityAge = 24 * 60 → day 9 of 60.
    expect(within(row).getByText('day 9 of 60')).toBeTruthy();
    // Satiation 20 and 60 average to 40, and one of the two is starving.
    expect(within(row).getByText('1 hungry').className).toContain('text-alert');
    expect(within(row).getByText('40 %')).toBeTruthy();
    // Condition 100 and 50 average to 75.
    expect(within(row).getByText('75 %')).toBeTruthy();
  });

  it('sells every fry from one control, however many batches are in the tank', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'f3', species: 'neon_tetra', stage: 'fry', age: 24 }),
    ];
    const actions = renderRoster(tank(fish));

    expect(screen.getByText(/Guppy fry/)).toBeTruthy();
    expect(screen.getByText(/Neon Tetra fry/)).toBeTruthy();

    const sell = screen.getAllByRole('button', { name: 'Sell 3 fry' });
    expect(sell).toHaveLength(1);
    fireEvent.click(sell[0]);
    expect(actions).toEqual([{ type: 'sellFry' }]);
  });

  it('offers nothing to sell when the tank has no fry', () => {
    renderRoster(tank(community()));
    expect(screen.queryByRole('button', { name: /Sell .* fry/ })).toBeNull();
  });

  it('escalates a species row to its worst fish rather than its average', () => {
    const fish = [
      makeFish({ id: 'fish_a_1', satiation: 100 }),
      makeFish({ id: 'fish_a_2', satiation: 0 }),
    ];
    renderRoster(tank(fish));

    const row = screen.getByRole('button', { name: 'Neon Tetra — 2 fish' }).closest('tr')!;
    // The mean of 100 and 0 sits in the calm middle; the starving fish must not.
    expect(within(row).getByText('50 %')).toBeTruthy();
    expect(within(row).getByText('1 hungry').className).toContain('text-alert');
  });

  it('scrolls the roster alone, with the header and the bioload pinned outside it', () => {
    const fish = Array.from({ length: 40 }, (_, i) =>
      makeFish({ id: `fish_a_${i}`, species: i % 2 === 0 ? 'neon_tetra' : 'guppy' })
    );
    renderRoster(tank(fish));

    fireEvent.click(screen.getByRole('button', { name: 'Neon Tetra — 20 fish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guppy — 20 fish' }));
    // Column header + two species rows + every fish beneath them.
    expect(screen.getAllByRole('row')).toHaveLength(43);

    const table = screen.getByRole('table');
    expect(table.querySelector('thead')!.className).toContain('sticky top-0');

    const scroller = table.parentElement!;
    expect(scroller.className).toContain('overflow-y-auto');

    const foot = screen.getByText('vs guideline').closest('div')!;
    expect(scroller.contains(foot)).toBe(false);
    expect(foot.className).toContain('shrink-0');

    // Nothing may push the card past the stage, or the stage scrolls the
    // column header and the bioload foot away with it.
    const card = scroller.parentElement!;
    expect(card.className).toContain('h-full');
    expect(card.className).not.toMatch(/min-h-/);
    expect(card.parentElement!.className).toContain('overflow-hidden');
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
    // The bands you check against the heater target, the tap and the filter,
    // before buying.
    expect(
      within(angelfish).getByText('24–30°C · pH 6.0–7.5 · flow to 10 ×/h · hardiness 0.4')
    ).toBeTruthy();

    // The sex fact is the menu's own description, not a stray child of it.
    const menu = screen.getByRole('menu');
    const note = screen.getByText(/Sex is random/);
    expect(menu.getAttribute('aria-describedby')).toBe(note.id);
    expect(menu.contains(note)).toBe(false);

    fireEvent.click(screen.getByRole('menuitem', { name: /Corydoras/ }));
    expect(actions).toEqual([{ type: 'addFish', species: 'corydoras' }]);
  });

  it('still opens to say why, when every species is blocked', () => {
    // A tank too small for anything: the engine's own refusal is the message.
    const state = { ...tank(community()), tank: { ...tank().tank, capacity: 0.001 } };
    renderRoster(state);

    fireEvent.click(screen.getByRole('button', { name: 'Add fish' }));
    const angelfish = screen.getByRole('menuitem', { name: /Angelfish/ });
    expect(angelfish.hasAttribute('disabled')).toBe(true);
    expect(within(angelfish).getByText(/Tank at fish capacity/)).toBeTruthy();
  });

  it('keeps husbandry out of the section — feeding left with the Actions sheet', () => {
    renderRoster(tank(community()));

    expect(screen.queryByRole('button', { name: /Feed/ })).toBeNull();
    // Construction and roster verbs are the section's own and stay put.
    expect(screen.getByRole('button', { name: 'Add fish' })).toBeTruthy();
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
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 * 4, satiation: 10 }),
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
      presetModified: false,
      units: 'metric',
      aggregates: emptyAggregates(),
      runLogs: state.logs,
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

    // One adult sits at satiation 40 (hungry) and one fry at 10 (starving), so
    // the pill counts both and takes the worse of the two bands.
    expect(railFigure(state).pill).toEqual({ text: '2 hungry', status: 'alert' });

    const neon = screen.getByRole('button', { name: 'Neon Tetra — 2 fish' }).closest('tr')!;
    const fry = screen.getByText(/Guppy fry/).closest('tr')!;
    expect(within(neon).getByText('1 hungry').className).toContain('text-warn');
    expect(within(fry).getByText('1 hungry').className).toContain('text-alert');
  });
});
