import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { FloraSection } from './FloraSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  getDosePreview,
  tick,
  type Action,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { calculatePassiveResources } from '../../simulation/equipment/index.js';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

const FORMULA = DEFAULT_CONFIG.nutrients.fertilizerFormula;

function tank(): SimulationState {
  const state = createSimulation({ tankCapacity: 200 });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state).surface;
  return state;
}

/** A scaped, planted tank a few days into a run — vitality has something to say. */
function grown(species: PlantSpecies[] = ['java_fern', 'monte_carlo']): SimulationState {
  let state = species.reduce(
    (current, s) => applyAction(current, { type: 'addPlant', species: s }).state,
    tank()
  );
  state = applyAction(state, { type: 'feed', amount: 1 }).state;
  for (let hour = 0; hour < 24; hour++) state = tick(state, DEFAULT_CONFIG);
  return state;
}

interface Spy {
  actions: Action[];
  hardscape: string[];
  substrate: string[];
  removed: string[];
}

function renderFlora(state: SimulationState): Spy {
  const spy: Spy = { actions: [], hardscape: [], substrate: [], removed: [] };
  const sim = {
    state,
    executeAction: (action: Action) => spy.actions.push(action),
    addHardscapeItem: (type: string) => spy.hardscape.push(type),
    removeHardscapeItem: (id: string) => spy.removed.push(id),
    updateSubstrateType: (type: string) => spy.substrate.push(type),
  } as unknown as ReturnType<typeof useSimulation>;

  render(
    <PersistenceProvider>
      <UnitsProvider>
        <FloraSection sim={sim} config={DEFAULT_CONFIG} />
      </UnitsProvider>
    </PersistenceProvider>
  );
  return spy;
}

describe('FloraSection', () => {
  it('lists every plant with the engine’s condition word, and the algae beside them', () => {
    const state = grown();
    renderFlora(state);

    expect(screen.getByRole('heading', { level: 2, name: 'Plants' })).toBeTruthy();
    expect(screen.getByText('Java Fern')).toBeTruthy();
    expect(screen.getByText('Monte Carlo')).toBeTruthy();
    expect(screen.getByText('Algae')).toBeTruthy();
    expect(screen.getByText(new RegExp(`^${state.plants.length} of 31 slots`))).toBeTruthy();
  });

  it('expands a plant into the engine’s own vitality factors, and removes it', () => {
    const state = grown(['monte_carlo']);
    const spy = renderFlora(state);

    expect(screen.queryByText('net')).toBeNull();
    fireEvent.click(screen.getByText('Monte Carlo'));
    expect(screen.getByText('net')).toBeTruthy();
    expect(screen.getByText('Nutrient deficiency')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove Monte Carlo'));
    expect(spy.actions).toEqual([{ type: 'removePlant', plantId: state.plants[0].id }]);
  });

  it('reads nutrients against what the tank’s plants need, and prices the fix', () => {
    const state = grown(['monte_carlo']);
    renderFlora(state);

    const header = screen.getByRole('heading', { level: 2, name: 'Nutrients' }).parentElement!
      .parentElement!;
    expect(within(header).getByText('nothing dosed')).toBeTruthy();
    expect(within(header).getByText(/high demand/)).toBeTruthy();

    // The engine's optimal ppm for a high-demand plant, shown as the need.
    expect(screen.getByText('needs 15.0')).toBeTruthy();
    expect(screen.getByText('needs 0.15')).toBeTruthy();
    expect(screen.getByText(/60 ml covers NO₃, PO₄, K and Fe/)).toBeTruthy();
  });

  it('previews one ml at the tank’s live volume, not its capacity', () => {
    let state = grown(['monte_carlo']);
    for (let hour = 0; hour < 24 * 10; hour++) state = tick(state, DEFAULT_CONFIG);
    renderFlora(state);

    const preview = getDosePreview(1, state.resources.water, FORMULA);
    expect(state.resources.water).toBeLessThan(state.tank.capacity);
    expect(
      screen.getByText(
        `1 ml adds +${preview.nitratePpm.toFixed(1)} NO₃ · +${preview.phosphatePpm.toFixed(2)} PO₄ · ` +
          `+${preview.potassiumPpm.toFixed(1)} K · +${preview.ironPpm.toFixed(2)} Fe`
      )
    ).toBeTruthy();
  });

  it('reads the scape out with each piece’s surface, and the biofilter ceiling it sums to', () => {
    const scaped = tank();
    scaped.equipment.hardscape.items = [{ id: 'h1', type: 'driftwood' }];
    scaped.resources.surface = calculatePassiveResources(scaped).surface;
    const state = applyAction(scaped, { type: 'addPlant', species: 'java_fern' }).state;
    const spy = renderFlora(state);

    expect(screen.getByText(`1 of ${state.tank.hardscapeSlots} slots`)).toBeTruthy();
    expect(screen.getByText('Driftwood')).toBeTruthy();
    // The engine's own surface for driftwood, and the total it feeds into.
    expect(screen.getByText('650 cm²')).toBeTruthy();
    expect(screen.getByText('Lowers pH')).toBeTruthy();
    expect(screen.getByText('Bacteria surface')).toBeTruthy();
    expect(
      screen.getByText(`${Math.round(state.resources.surface).toLocaleString()} cm²`)
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove Driftwood'));
    expect(spy.removed).toEqual(['h1']);

    fireEvent.change(screen.getByLabelText('Substrate'), { target: { value: 'sand' } });
    expect(spy.substrate).toEqual(['sand']);
  });

  it('keeps both construction verbs in the header, gated on the engine’s own limits', () => {
    const state = tank();
    const spy = renderFlora(state);

    fireEvent.click(screen.getByRole('button', { name: 'Add plant' }));
    // Aqua soil takes every species; the menu says what each one asks for.
    expect(screen.getByRole('menuitem', { name: /Monte Carlo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Java Fern/ }));
    expect(spy.actions).toEqual([{ type: 'addPlant', species: 'java_fern' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Add hardscape' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Driftwood/ }));
    expect(spy.hardscape).toEqual(['driftwood']);
  });

  it('disables the species a bare tank cannot take, naming what they need', () => {
    const bare = createSimulation({ tankCapacity: 200 });
    renderFlora(bare);

    fireEvent.click(screen.getByRole('button', { name: 'Add plant' }));
    const carpet = screen.getByRole('menuitem', { name: /Monte Carlo/ }) as HTMLButtonElement;
    expect(carpet.disabled).toBe(true);
    expect(within(carpet).getByText('needs aqua soil')).toBeTruthy();
    expect((screen.getByRole('menuitem', { name: /Java Fern/ }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('invites the first plant instead of pointing somewhere else', () => {
    renderFlora(tank());
    expect(screen.getByText('No plants yet — add one to begin.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/from Scape|in Build|go to/i);
  });
});
