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

function tank(): SimulationState {
  const state = createSimulation({ tankCapacity: 200, tapWaterTemperature: 18, tapWaterPH: 7.4 });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state, DEFAULT_CONFIG.light).surface;
  state.resources.water = 196.4;
  state.algae.mass = 47;
  return applyAction(applyAction(state, { type: 'addFish', species: 'betta' }).state, {
    type: 'addPlant',
    species: 'java_fern',
  }).state;
}

const base: SimulationState = tank();

/** The reader's units come from their locale, so a figure-checking test names one. */
function ForceMetric(): null {
  const { unitSystem, setUnitSystem } = useUnits();
  useEffect(() => {
    if (unitSystem !== 'metric') setUnitSystem('metric');
  }, [unitSystem, setUnitSystem]);
  return null;
}

function Harness({ actions }: { actions: Action[] }): React.JSX.Element {
  const sheet = useActionsSheet((action) => actions.push(action));
  const promoted = verbRow(base, sheet.promoted, sheet.settings, 'metric');
  return (
    <>
      <span data-testid="dock">
        <ActionsTrigger
          label={`${promoted.name} ${promoted.value}`}
          open={sheet.open}
          onClick={sheet.toggle}
        />
      </span>
      {sheet.open && <ActionsSheet sheet={sheet} state={base} config={DEFAULT_CONFIG} />}
    </>
  );
}

let actions: Action[];
let media: MatchMediaStub;

// No rail to anchor a card to, so the sheet is a drill-in: list, then settings.
beforeEach(() => {
  media = stubMatchMedia(viewport(390));
  actions = [];
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ForceMetric />
        <Harness actions={actions} />
      </UnitsProvider>
    </PersistenceProvider>
  );
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

/** The dock's trigger, which reads "Actions …" exactly as the back control does. */
function dockTrigger(): HTMLElement {
  return within(screen.getByTestId('dock')).getByRole('button');
}

function open(): HTMLElement {
  fireEvent.click(dockTrigger());
  return screen.getByRole('dialog', { name: 'Actions' });
}

/** Empty on a detail screen: drilling in replaces the list rather than hiding it. */
function rows(): HTMLElement[] {
  const list = screen.queryByRole('group', { name: 'Verbs' });
  return list === null ? [] : within(list).getAllByRole('button');
}

function row(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Verbs' })).getByRole('button', {
    name: new RegExp(`^${name}`),
  });
}

function back(sheet: HTMLElement): HTMLElement {
  return within(sheet).getByRole('button', { name: 'Actions' });
}

describe('ActionsSheet on a phone', () => {
  it('opens on the verb list and nothing else', () => {
    const sheet = open();

    expect(rows().map((verb) => verb.dataset.verb)).toEqual([
      'feed',
      'waterChange',
      'topOff',
      'dose',
      'trimPlants',
      'scrubAlgae',
    ]);
    expect(within(sheet).queryByRole('heading')).toBeNull();
    expect(sheet.textContent).not.toContain('At commit');
  });

  it('drills into a verb, then back out to the row it came from', () => {
    const sheet = open();

    fireEvent.click(row('Water Δ'));
    expect(within(sheet).getByRole('heading', { name: 'Water change' })).toBeTruthy();
    expect(rows()).toHaveLength(0);

    fireEvent.click(back(sheet));
    expect(rows()).toHaveLength(6);
    expect(within(sheet).queryByRole('heading')).toBeNull();
    // A pop lands where it left, not at the top of the list.
    expect((document.activeElement as HTMLElement).dataset.verb).toBe('waterChange');
  });

  it('keeps back and dismiss as separate controls doing separate things', () => {
    const sheet = open();
    expect(within(sheet).queryByRole('button', { name: 'Actions' })).toBeNull();

    fireEvent.click(row('Dose'));
    expect(back(sheet)).not.toBe(within(sheet).getByRole('button', { name: 'Close actions' }));

    fireEvent.click(back(sheet));
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeTruthy();

    fireEvent.click(row('Dose'));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close actions' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions).toEqual([]);
  });

  it('ships no Cancel — ✕ already means the same thing', () => {
    const sheet = open();
    fireEvent.click(row('Scrub'));

    expect(within(sheet).queryByText('Cancel')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Scrub algae' })).toBeTruthy();
  });

  it('configures and commits from the detail screen, then stands down', () => {
    const sheet = open();

    fireEvent.click(row('Water Δ'));
    fireEvent.click(within(sheet).getByRole('button', { name: /^50 %/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change water · 50 %' }));

    expect(actions).toEqual([{ type: 'waterChange', amount: 0.5 }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dockTrigger().textContent).toContain('Water Δ 50 %');
  });

  it('re-opens on the list, holding the setting it was given', () => {
    const sheet = open();
    fireEvent.click(row('Dose'));
    fireEvent.click(within(sheet).getByRole('button', { name: /^4 ml/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close actions' }));

    open();
    expect(rows()).toHaveLength(6);
    expect(row('Dose').textContent).toContain('4 ml');
  });
});
