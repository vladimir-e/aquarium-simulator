import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ActionsSheet } from './ActionsSheet';
import { ActionsTrigger } from './ActionsTrigger';
import { useActionsSheet } from '../../hooks/useActionsSheet';
import { UnitsProvider, useUnits } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { verbRow } from '../../actions';
import {
  applyAction,
  createSimulation,
  type Action,
  type SimulationState,
} from '../../../simulation/index.js';
import { calculatePassiveResources } from '../../../simulation/equipment/index.js';

let media: MatchMediaStub;

// The rail stands, so the sheet is the card: master beside detail, both at once.
beforeEach(() => {
  media = stubMatchMedia(viewport(1280));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

function tank(): SimulationState {
  const state = createSimulation({ tankCapacity: 200, tapWaterTemperature: 18, tapWaterPH: 7.4 });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state).surface;
  state.resources.water = 196.4;
  state.resources.nitrite = 0.412 * 196.4;
  state.algae.mass = 47;
  return applyAction(applyAction(state, { type: 'addFish', species: 'betta' }).state, {
    type: 'addPlant',
    species: 'java_fern',
  }).state;
}

/** The reader's units come from their locale, so a figure-checking test names one. */
function ForceMetric(): null {
  const { unitSystem, setUnitSystem } = useUnits();
  useEffect(() => {
    if (unitSystem !== 'metric') setUnitSystem('metric');
  }, [unitSystem, setUnitSystem]);
  return null;
}

function Harness({
  state,
  actions,
}: {
  state: SimulationState;
  actions: Action[];
}): React.JSX.Element {
  const sheet = useActionsSheet((action) => actions.push(action));
  const promoted = verbRow(state, sheet.promoted, sheet.settings, 'metric');
  return (
    <>
      <ActionsTrigger
        label={`${promoted.name} ${promoted.value}`}
        open={sheet.open}
        onClick={sheet.toggle}
      />
      {sheet.open && <ActionsSheet sheet={sheet} state={state} config={DEFAULT_CONFIG} />}
    </>
  );
}

function renderSheet(state: SimulationState = tank()): Action[] {
  const actions: Action[] = [];
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ForceMetric />
        <Harness state={state} actions={actions} />
      </UnitsProvider>
    </PersistenceProvider>
  );
  return actions;
}

function open(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /Actions/ }));
  return screen.getByRole('dialog', { name: 'Actions' });
}

function verb(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Verbs' })).getByRole('button', {
    name: new RegExp(`^${name}`),
  });
}

/** A verb tile and its commit can read alike, so the commit is the one outside the picker. */
function commit(label: string | RegExp): HTMLButtonElement {
  const picker = screen.getByRole('group', { name: 'Verbs' });
  const found = screen.getAllByRole('button', { name: label }).find((b) => !picker.contains(b));
  expect(found, `no commit named ${label}`).toBeTruthy();
  return found as HTMLButtonElement;
}

/** The dismiss catcher is presentational, so it answers to no role. */
function catcher(sheet: HTMLElement): HTMLElement {
  return sheet.previousElementSibling as HTMLElement;
}

describe('ActionsSheet', () => {
  it('opens from the trigger and puts all six verbs on one surface', () => {
    renderSheet();
    const sheet = open();

    for (const name of ['Feed', 'Water Δ', 'Top-off', 'Dose', 'Trim', 'Scrub']) {
      expect(verb(name)).toBeTruthy();
    }
    expect(within(sheet).getByRole('heading', { name: 'Feed' })).toBeTruthy();
  });

  it('stacks the six verbs in one column, never a grid', () => {
    renderSheet();
    open();

    const picker = screen.getByRole('group', { name: 'Verbs' });
    expect(picker.className).toContain('flex-col');
    expect(picker.className).not.toMatch(/\bgrid/);
  });

  it('holds the card at 380 however many rows the preview costs', () => {
    renderSheet();
    const sheet = open();
    // Every height rule on the card, so a min-h or max-h sneaking in fails too.
    const height = (): string[] =>
      sheet.className.split(' ').filter((rule) => /^(min-|max-)?h-/.test(rule));
    const previewRows = (): number => sheet.querySelectorAll('[data-reading]').length;

    fireEvent.click(verb('Water Δ'));
    const tall = previewRows();
    expect(height()).toEqual(['h-[380px]']);

    fireEvent.click(verb('Scrub'));
    // A scrub moves one reading; a water change moves the most of any verb.
    expect(previewRows()).toBe(1);
    expect(tall).toBeGreaterThan(1);
    expect(height()).toEqual(['h-[380px]']);
  });

  it('swaps the settings step without closing the list', () => {
    renderSheet();
    const sheet = open();

    fireEvent.click(verb('Water Δ'));

    expect(within(sheet).getByRole('heading', { name: 'Water change' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /^Feed/ })).toBeTruthy();
    expect(commit('Change water · 25 %')).toBeTruthy();
  });

  it('re-prices the preview and the commit when a chip is chosen', () => {
    renderSheet();
    const sheet = open();
    fireEvent.click(verb('Water Δ'));

    expect(sheet.textContent).toContain('49.1 L out');
    fireEvent.click(within(sheet).getByRole('button', { name: /^90 %/ }));

    expect(sheet.textContent).toContain('176.8 L out');
    expect(commit('Change water · 90 %')).toBeTruthy();
  });

  it('dispatches the configured action and stands down', () => {
    const actions = renderSheet();
    open();
    fireEvent.click(verb('Water Δ'));
    fireEvent.click(screen.getByRole('button', { name: /^50 %/ }));
    fireEvent.click(commit('Change water · 50 %'));

    expect(actions).toEqual([{ type: 'waterChange', amount: 0.5 }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('promotes the verb it just committed onto the trigger', () => {
    renderSheet();
    open();
    fireEvent.click(verb('Scrub'));
    fireEvent.click(commit('Scrub algae'));

    expect(screen.getByRole('button', { name: /Actions/ }).textContent).toContain('Scrub 47 %');
  });

  it.each([
    ['Cancel', (sheet: HTMLElement): void => void fireEvent.click(within(sheet).getByText('Cancel'))],
    ['Escape', (): void => void fireEvent.keyDown(window, { key: 'Escape' })],
    ['a click outside it', (sheet: HTMLElement): void => void fireEvent.click(catcher(sheet))],
  ])('goes away on %s, committing nothing', (_label, dismiss) => {
    const actions = renderSheet();
    dismiss(open());

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions).toEqual([]);
  });

  it('keeps a setting through a dismissal — closing is "not now", not "discard"', () => {
    const actions = renderSheet();
    open();
    fireEvent.click(verb('Dose'));
    fireEvent.click(screen.getByRole('button', { name: /^4 ml/ }));
    fireEvent.keyDown(window, { key: 'Escape' });

    const sheet = open();
    expect(within(sheet).getByRole('heading', { name: 'Dose fertiliser' })).toBeTruthy();
    expect(verb('Dose').textContent).toContain('4 ml');
    fireEvent.click(commit('Dose 4 ml'));

    expect(actions).toEqual([{ type: 'dose', amountMl: 4 }]);
  });

  it('opens a blocked verb rather than sealing it, and refuses the commit with its reason', () => {
    const state = tank();
    const full = { ...state, resources: { ...state.resources, water: state.tank.capacity } };
    const actions = renderSheet(full);
    const sheet = open();

    // The refusal rides the tile, so it is readable before the verb is chosen.
    const tile = within(sheet).getByRole('button', { name: /^Top-off/ });
    expect(tile.textContent).toContain('already at capacity');

    fireEvent.click(tile);
    const refused = commit(/^Top off/);
    expect(refused.disabled).toBe(true);
    fireEvent.click(refused);

    expect(actions).toEqual([]);
    expect(within(sheet).getAllByText('already at capacity').length).toBeGreaterThan(1);
    // An action that moves nothing says so rather than showing an empty block.
    expect(sheet.textContent).toContain('Nothing moves');
  });

  it('shows a bare verb its range rather than an invented figure', () => {
    renderSheet();
    const sheet = open();
    fireEvent.click(verb('Scrub'));

    expect(sheet.textContent).toContain('No amount to set');
    expect(sheet.textContent).toContain('33–42');
  });

  it('reads out the engine’s consequences, before and after', () => {
    renderSheet();
    const sheet = open();
    fireEvent.click(verb('Water Δ'));

    const nitrite = within(sheet).getByText('NO₂').parentElement as HTMLElement;
    expect(nitrite.textContent).toContain('0.412');
    expect(nitrite.textContent).toContain('0.303');
    // A Betta puts the tolerated floor at 24 °C, which 18 °C tap breaches.
    expect(sheet.textContent).toContain('below 24°C — heater recovers');
  });
});
