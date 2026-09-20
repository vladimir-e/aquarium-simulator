import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { LifeSection } from './LifeSection';
import { bare, stocked, type Run } from '../test/run';
import { group, renderStage } from '../test/stage';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  computeFishVitality,
  type Action,
  type Fish,
  type FishSpecies,
  type SimulationState,
} from '../../simulation/index.js';

afterEach(cleanup);

/** A section wired to a tank that actually changes when an action commits. */
function Live({ run }: { run: Run }): React.JSX.Element {
  const [state, setState] = useState(run.state);
  const sim = stubSim(state, run.history);
  sim.executeAction = (action: Action): void => {
    setState((current) => applyAction(current, action, DEFAULT_CONFIG).state);
  };
  return <LifeSection sim={sim} config={DEFAULT_CONFIG} />;
}

function renderLife(run: Run = stocked()): { onAct: ReturnType<typeof vi.fn> } {
  const onAct = vi.fn();
  renderStage(<Live run={run} />, { onAct });
  return { onAct };
}

function speciesRow(table: 'Fish' | 'Plants', name: string): HTMLElement {
  return within(group(table)).getByRole('button', { name: new RegExp(`^${name} — \\d`) });
}

describe('LifeSection', () => {
  it('lays the tank out as two tables, fish then plants', () => {
    renderLife();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fish',
      'Plants',
    ]);
  });

  it('opens a species row onto the individuals under it', () => {
    renderLife();
    expect(screen.queryAllByRole('button', { name: /^Remove Neon Tetra/ })).toHaveLength(0);

    fireEvent.click(speciesRow('Fish', 'Neon Tetra'));

    expect(screen.getAllByRole('button', { name: /^Remove Neon Tetra/ })).toHaveLength(6);
  });

  it('reads the algae as one population row, with nobody in it to count', () => {
    renderLife();
    const plants = within(group('Plants'));

    expect(plants.getByRole('button', { name: /^Algae — / })).toBeTruthy();
    expect(plants.queryByRole('img', { name: /Algae/ })).toBeNull();
    expect(plants.getByRole('img', { name: /Anubias by individual/ }).children).toHaveLength(2);
  });

  it('reads the bioload against the guideline rather than against a cap', () => {
    renderLife();
    const fish = within(group('Fish'));

    expect(fish.getByText('Bioload')).toBeTruthy();
    expect(fish.getByText(/guideline \d+ g at [\d.]+ g\//)).toBeTruthy();
  });

  it('invites stocking on a bare tank, in the verb that does it', () => {
    renderLife(bare());

    expect(screen.getByText(/No fish yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add fish' })).toBeTruthy();
    expect(screen.getByText(/No plants yet/)).toBeTruthy();
  });

  it('names the engine’s own factors in the ledger of a hungry fish', () => {
    const run = stocked();
    const state: SimulationState = {
      ...run.state,
      fish: run.state.fish.map((fish, i) => (i === 0 ? { ...fish, satiation: 2 } : fish)),
    };
    renderLife({ ...run, state });

    fireEvent.click(speciesRow('Fish', 'Neon Tetra'));
    fireEvent.click(screen.getByRole('button', { name: /^Neon Tetra .+ — starving/ }));

    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText('Helping')).toBeTruthy();
    expect(drawer.getByText('Hurting')).toBeTruthy();
    expect(drawer.getByText(/per day/)).toBeTruthy();

    const { breakdown } = computeFishVitality(
      state.fish[0],
      state.resources,
      state.plants,
      state.resources.water,
      state.tank.capacity,
      DEFAULT_CONFIG.livestock
    );
    for (const factor of [...breakdown.stressors, ...breakdown.upkeep, ...breakdown.benefits]) {
      if (factor.amount > 0) expect(drawer.getByText(factor.label)).toBeTruthy();
    }
  });

  it('opens a group’s ledger on its worst member, and says which', () => {
    renderLife();
    fireEvent.click(
      within(group('Fish')).getByRole('button', { name: /inspect the worst of 6/ })
    );

    expect(within(screen.getByRole('dialog')).getByText(/the worst of 6 Neon Tetra/)).toBeTruthy();
  });

  it('adds the fish the picker committed to, and the roster shows them', () => {
    renderLife(bare());

    const header = screen.getByRole('heading', { level: 1, name: 'Life' }).parentElement!;
    fireEvent.click(within(header).getByRole('button', { name: '+ Add' }));
    fireEvent.click(within(header).getByRole('button', { name: 'Add fish' }));

    const drawer = within(screen.getByRole('dialog'));
    fireEvent.click(drawer.getByRole('button', { name: 'increase' }));
    fireEvent.click(drawer.getByRole('button', { name: 'Add 2 Neon Tetra' }));

    expect(speciesRow('Fish', 'Neon Tetra').parentElement!.textContent).toContain('×2');
  });

  it('sells the whole tank’s fry from the one row they share', () => {
    const run = stocked();
    const fry = (id: string, species: FishSpecies): Fish => ({
      ...run.state.fish[0],
      id,
      species,
      stage: 'fry',
      mass: 0.05,
    });
    const state: SimulationState = {
      ...run.state,
      fish: [
        ...run.state.fish.filter((fish) => fish.stage === 'adult'),
        fry('fish_z_1', 'guppy'),
        fry('fish_z_2', 'guppy'),
        fry('fish_z_3', 'betta'),
      ],
    };
    renderLife({ ...run, state });

    expect(within(group('Fish')).getByText('Fry')).toBeTruthy();
    expect(within(group('Fish')).getByText('2 species')).toBeTruthy();

    fireEvent.click(within(group('Fish')).getByRole('button', { name: 'Sell all fry (3)' }));

    expect(within(group('Fish')).queryByText('Fry')).toBeNull();
  });

  it('hands the husbandry verbs to the Act drawer', () => {
    const { onAct } = renderLife();
    const header = screen.getByRole('heading', { level: 1, name: 'Life' }).parentElement!;

    for (const verb of ['Feed', 'Trim', 'Scrub']) {
      fireEvent.click(within(header).getByRole('button', { name: verb }));
    }
    expect(onAct.mock.calls).toEqual([['feed'], ['trimPlants'], ['scrubAlgae']]);
  });
});
