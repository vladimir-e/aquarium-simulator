import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { LifeSection } from './LifeSection';
import { bare, stocked, type Run } from '../test/run';
import { group, query, renderStage } from '../test/stage';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { LEDGER_DECIMALS, readHourAhead } from '../run';
import {
  applyAction,
  type Action,
  type Fish,
  type FishSpecies,
  type SimulationState,
} from '../../simulation/index.js';

afterEach(cleanup);

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
  renderStage(<Live run={run} />, { onAct, state: run.state });
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

  it('reads each kind of bloom as one population row, with nobody in it to count', () => {
    renderLife();
    const plants = within(group('Plants'));

    for (const name of ['Green water', 'Film']) {
      expect(plants.getByRole('button', { name: new RegExp(`^${name} — `) })).toBeTruthy();
      expect(plants.queryByRole('img', { name: new RegExp(name) })).toBeNull();
    }
    expect(plants.getByRole('img', { name: /Anubias by family/ }).children).toHaveLength(2);
  });

  it.each(['Green water', 'Film'])('opens the %s ledger on the organism: its condition, coverage, light and bank', (name) => {
    renderLife();
    fireEvent.click(within(group('Plants')).getByRole('button', { name: new RegExp(`^${name} — `) }));

    const drawer = within(screen.getByRole('dialog', { name }));
    expect(drawer.getByText('% condition')).toBeTruthy();
    expect(drawer.getByText('Coverage')).toBeTruthy();
    expect(drawer.getByText('% of need')).toBeTruthy();
    expect(drawer.getByText('Bank')).toBeTruthy();
    expect(drawer.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  describe('plant families', () => {
    /** The stocked tank, its first anubias having budded once. */
    function propagated(): { run: Run; founder: string; label: string } {
      const run = stocked();
      const [first] = run.state.plants;
      const state: SimulationState = {
        ...run.state,
        plants: [...run.state.plants, { ...first, id: 'plant_bud', parentId: first.id, size: 20 }],
      };
      return { run: { ...run, state }, founder: first.id, label: 'Anubias family 1' };
    }

    it('opens a species onto its families, and a family onto its units to remove one', () => {
      const { run, label } = propagated();
      renderLife(run);
      const plants = within(group('Plants'));

      fireEvent.click(speciesRow('Plants', 'Anubias'));
      expect(plants.getAllByRole('button', { name: /^Anubias family \d — \d/ })).toHaveLength(2);
      expect(plants.queryByRole('button', { name: `Remove ${label} · #2` })).toBeNull();

      fireEvent.click(plants.getByRole('button', { name: new RegExp(`^${label} — 2`) }));
      expect(plants.getByText('from', { exact: false }).textContent).toBe(' · from #1');

      fireEvent.click(plants.getByRole('button', { name: `Remove ${label} · #2` }));
      expect(plants.queryByRole('button', { name: `Remove ${label} · #2` })).toBeNull();
      expect(plants.getByRole('button', { name: new RegExp(`^${label} — 1`) })).toBeTruthy();
    });

    it('trims one family from its own row', () => {
      const { run, founder, label } = propagated();
      const { onAct } = renderLife(run);

      fireEvent.click(speciesRow('Plants', 'Anubias'));
      fireEvent.click(within(group('Plants')).getByRole('button', { name: `Trim ${label}` }));

      expect(onAct.mock.calls).toEqual([['trimPlants', undefined, { familyId: founder }]]);
    });

    it('opens a family’s ledger on its worst unit, and says which', () => {
      const { run, label } = propagated();
      renderLife(run);

      fireEvent.click(speciesRow('Plants', 'Anubias'));
      fireEvent.click(
        within(group('Plants')).getByRole('button', {
          name: `${label} — inspect the worst of 2`,
        })
      );

      const drawer = within(screen.getByRole('dialog'));
      expect(drawer.getByText(`the worst of 2 in ${label}`)).toBeTruthy();
      expect(drawer.getByText('% of need')).toBeTruthy();
      expect(drawer.getByText('% to offshoot')).toBeTruthy();
    });
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
      fish: run.state.fish.map((fish, i) => (i === 0 ? { ...fish, gut: 0 } : fish)),
    };
    renderLife({ ...run, state });

    fireEvent.click(speciesRow('Fish', 'Neon Tetra'));
    fireEvent.click(screen.getByRole('button', { name: /^Neon Tetra .+ — starving/ }));

    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText('Helping')).toBeTruthy();
    expect(drawer.getByText('Hurting')).toBeTruthy();
    expect(drawer.getByText(/per day/)).toBeTruthy();

    const { breakdown } = readHourAhead(state, DEFAULT_CONFIG).fish[0].vitality;
    const prints = (amount: number): boolean => Number((amount * 24).toFixed(LEDGER_DECIMALS)) > 0;
    for (const factor of [...breakdown.stressors, ...breakdown.benefits]) {
      if (prints(factor.amount)) expect(drawer.getAllByText(factor.label).length).toBeGreaterThan(0);
    }
  });

  it('opens a group’s ledger on its worst member, and says which', () => {
    renderLife();
    fireEvent.click(
      within(group('Fish')).getByRole('button', { name: /inspect the worst of 6/ })
    );

    expect(within(screen.getByRole('dialog')).getByText(/the worst of 6 Neon Tetra/)).toBeTruthy();
    expect(query().get('inspect')).toBe('species-neon_tetra');
  });

  it('opens the ledger the address names, as a group stands when it is read', () => {
    renderStage(<Live run={stocked()} />, { path: '/life?inspect=species-neon_tetra' });

    expect(within(screen.getByRole('dialog')).getByText(/the worst of 6 Neon Tetra/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Close/ }));
    expect(query().get('inspect')).toBeNull();
  });

  it('trims a unit’s own family from its ledger', () => {
    const run = stocked();
    const [first] = run.state.plants;
    const { onAct } = renderLife(run);

    fireEvent.click(speciesRow('Plants', 'Anubias'));
    fireEvent.click(
      within(group('Plants')).getByRole('button', { name: 'Anubias family 1 — inspect the worst of 1' })
    );
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Trim/ }));

    expect(onAct.mock.calls).toEqual([['trimPlants', undefined, { familyId: first.familyId }]]);
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

  it('opens the picker the address names, and leaves the rest of the query alone', () => {
    renderStage(<Live run={stocked()} />, { path: '/life?tick=300' });

    const header = screen.getByRole('heading', { level: 1, name: 'Life' }).parentElement!;
    fireEvent.click(within(header).getByRole('button', { name: '+ Add' }));
    fireEvent.click(within(header).getByRole('button', { name: 'Add fish' }));

    expect(screen.getByRole('dialog', { name: /Add fish/ })).toBeTruthy();
    expect(query().get('tick')).toBe('300');

    fireEvent.click(screen.getByRole('button', { name: /^Close/ }));
    expect(query().get('add')).toBeNull();
    expect(query().get('tick')).toBe('300');
  });

  it('opens the picker on a direct load of its address', () => {
    renderStage(<Live run={stocked()} />, { path: '/life?add=fish' });

    expect(screen.getByRole('dialog', { name: /Add fish/ })).toBeTruthy();
  });

  it('hands the husbandry verbs to the Act drawer, each naming its amount', () => {
    const { onAct } = renderLife();
    const header = screen.getByRole('heading', { level: 1, name: 'Life' }).parentElement!;

    for (const verb of [/^Feed · 0\.5 g$/, /^Trim · to 75 %$/, /^Scrub · \d+ %$/]) {
      fireEvent.click(within(header).getByRole('button', { name: verb }));
    }
    expect(onAct.mock.calls).toEqual([['feed'], ['trimPlants'], ['scrubAlgae']]);
  });
});
