import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { LifeSection } from './LifeSection';
import { stocked, type Run } from '../test/run';
import { group, renderStage } from '../test/stage';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';

let media: MatchMediaStub;

// Phone: the tables keep their outer columns and drop the figures between them.
beforeEach(() => {
  media = stubMatchMedia(viewport(390));
});

afterEach(() => {
  media.restore();
  cleanup();
});

/** A stocked tank that also carries a clutch and two species of fry. */
function busy(): Run {
  const run = stocked();
  const fry = (id: string, species: Fish['species']): Fish => ({
    ...run.state.fish[0],
    id,
    species,
    stage: 'fry',
    mass: 0.05,
  });
  const clutch: Clutch = {
    id: 'clutch_a_1',
    species: 'neon_tetra',
    eggCount: 20,
    laidTick: run.state.tick,
  };
  const state: SimulationState = {
    ...run.state,
    fish: [
      ...run.state.fish.filter((fish) => fish.stage === 'adult'),
      fry('fish_z_1', 'guppy'),
      fry('fish_z_2', 'betta'),
    ],
    clutches: [clutch],
  };
  return { ...run, state };
}

/** The tracks a template declares, read off the class the row is laid out by. */
function declared(className: string): number {
  const template = /(?:^|\s)grid-cols-\[([^\]]+)\]/.exec(className)![1];
  return template.split('_').length;
}

function span(cell: HTMLElement): number {
  const match = /(?:^|\s)col-span-(\d+)/.exec(cell.className);
  return match ? Number(match[1]) : 1;
}

/** `hidden` on its own — `md:hidden` is a cell this width still shows. */
function onPhone(cell: HTMLElement): boolean {
  return !/(?:^|\s)hidden(?:\s|$)/.test(cell.className) && !cell.className.includes('absolute');
}

/** The tracks a row actually fills: a hidden cell is out of the grid entirely. */
function filled(row: HTMLElement): number {
  return cells(row).filter(onPhone).reduce((total, cell) => total + span(cell), 0);
}

function cells(row: HTMLElement): HTMLElement[] {
  return [...row.children] as HTMLElement[];
}

function rowsOf(table: 'Fish' | 'Plants'): HTMLElement[] {
  return [...group(table).querySelectorAll<HTMLElement>('div.grid')];
}

describe('LifeSection (phone)', () => {
  it('fills every track the phone template declares, on every row kind', () => {
    renderStage(<LifeSection sim={stubSim(busy().state)} config={DEFAULT_CONFIG} />);
    fireEvent.click(
      within(group('Fish')).getByRole('button', { name: /^Neon Tetra — \d/ })
    );

    const rows = [...rowsOf('Fish'), ...rowsOf('Plants')];
    // Headings, species, individuals, the clutch, the fry row and the algae.
    expect(rows.length).toBeGreaterThan(6);

    for (const row of rows) {
      expect(filled(row)).toBe(declared(row.className));
    }
  });

  it('drops the figures between the name and the status, and keeps the rest', () => {
    renderStage(<LifeSection sim={stubSim(busy().state)} config={DEFAULT_CONFIG} />);
    const headings = rowsOf('Fish')[0];

    const visible = cells(headings).filter(onPhone).map((cell) => cell.textContent);
    expect(visible).toEqual(['', 'species', 'count', 'condition', 'status', '']);

    const dropped = cells(headings)
      .filter((cell) => !onPhone(cell))
      .map((cell) => cell.textContent);
    expect(dropped).toEqual(['mass', 'age', 'satiation']);
  });

  it('still opens a row’s ledger, where there is no room to read it in the table', () => {
    renderStage(<LifeSection sim={stubSim(stocked().state)} config={DEFAULT_CONFIG} />);
    fireEvent.click(
      within(group('Fish')).getByRole('button', { name: /inspect the worst of 6/ })
    );

    expect(within(screen.getByRole('dialog')).getByText('Helping')).toBeTruthy();
  });
});
