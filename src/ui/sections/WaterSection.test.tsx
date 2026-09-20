import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';
import { WaterSection } from './WaterSection';
import { bare, stocked, type Run } from '../test/run';
import { group, renderStage, row } from '../test/stage';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation } from '../../simulation/index.js';

afterEach(cleanup);

function renderWater(run: Run = bare()): { onAct: ReturnType<typeof vi.fn> } {
  const onAct = vi.fn();
  const sim = stubSim(run.state, run.history);
  renderStage(<WaterSection sim={sim} config={DEFAULT_CONFIG} />, { onAct });
  return { onAct };
}

describe('WaterSection', () => {
  it('reads down the left column and then the right, cycle above its bacteria', () => {
    renderWater(stocked());

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Water',
      'Gases',
      'Nutrients',
      'Nitrogen',
      'Biofilter',
      'Waste',
    ]);
  });

  it('names every reading the tank takes, each in its own section', () => {
    renderWater(stocked());

    for (const [title, names] of [
      ['Water', ['Temp', 'pH', 'Level']],
      ['Gases', ['O₂', 'CO₂']],
      ['Nutrients', ['NO₃', 'PO₄', 'K', 'Fe']],
      ['Nitrogen', ['NH₃', 'NO₂', 'NO₃']],
    ] as const) {
      for (const name of names) {
        expect(within(group(title)).getByText(name)).toBeTruthy();
      }
    }
  });

  it('says what the tank is running on, and offers the two verbs that move it', () => {
    const { onAct } = renderWater();

    const header = screen.getByRole('heading', { level: 1, name: 'Water' }).parentElement!;
    expect(within(header).getByText(/^(no heater|heater on) · ATO (on|off)$/)).toBeTruthy();

    fireEvent.click(within(header).getByRole('button', { name: 'Water change · 25 %' }));
    fireEvent.click(within(header).getByRole('button', { name: 'Top off' }));
    expect(onAct).toHaveBeenCalledTimes(2);
  });

  it('opens the same inspector from any row it is tapped on', () => {
    renderWater(stocked());
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(row('Nitrogen', 'NH₃'));
    const drawer = screen.getByRole('dialog', { name: 'NH₃' });
    expect(within(drawer).getByText(/Safe at or under/)).toBeTruthy();

    fireEvent.click(row('Water', 'Temp'));
    expect(screen.getByRole('dialog', { name: 'Temp' })).toBeTruthy();
  });

  it('leaves temperature unbanded until something in the tank prefers one', () => {
    renderWater();
    expect(row('Water', 'Temp').querySelector('[data-band]')).toBeNull();

    cleanup();
    renderWater(stocked());
    expect(row('Water', 'Temp').querySelector('[data-band]')).toBeTruthy();
  });

  it('states the band at the precision the reading is read to', () => {
    renderWater(stocked());
    fireEvent.click(row('Water', 'Temp'));

    const drawer = screen.getByRole('dialog', { name: 'Temp' });
    expect(within(drawer).getByText(/^\d+\.\d–\d+\.\d°[CF] — the span/)).toBeTruthy();
  });

  it('opens the toxin from the cycle’s NO₃ and the plant food from the nutrients’', () => {
    renderWater(stocked());

    fireEvent.click(row('Nitrogen', 'NO₃'));
    const toxin = screen.getByRole('dialog', { name: 'NO₃' });
    expect(within(toxin).getByText(/the engine alerts over/)).toBeTruthy();
    fireEvent.click(within(toxin).getByRole('button', { name: 'Close NO₃' }));

    fireEvent.click(row('Nutrients', 'NO₃'));
    expect(within(screen.getByRole('dialog', { name: 'NO₃' })).getByText(/Plants ask for/)).toBeTruthy();
  });

  it('carries the biofilter, its guilds and where the nitrite peak falls', () => {
    renderWater();

    const biofilter = group('Biofilter');
    expect(within(biofilter).getByText('uncycled')).toBeTruthy();
    expect(within(biofilter).getByText('AOB')).toBeTruthy();
    expect(within(biofilter).getByText('NOB')).toBeTruthy();
    expect(within(biofilter).getByText(/Uncycled\./)).toBeTruthy();
    expect(within(biofilter).getByText(/Nitrite peaks in|No nitrite peak within/)).toBeTruthy();
  });

  it('names every waste source, substrate included, on an unstocked soil tank', () => {
    renderWater(bare(createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } })));

    const waste = group('Waste');
    for (const label of ['Food decay', 'Fish', 'Plants', 'Substrate']) {
      expect(within(waste).getByText(label)).toBeTruthy();
    }
    expect(within(waste).getByText(/%\/h decay · .+ % to waste · Q10/)).toBeTruthy();
  });

  it('prints a flow arm under its own precision as none rather than a signed zero', () => {
    renderWater();
    fireEvent.click(row('Waste', 'Waste'));

    const drawer = screen.getByRole('dialog', { name: 'Waste' });
    expect(within(drawer).queryByText(/[+−]0\.000 g\/h/)).toBeNull();
    expect(within(drawer).queryByText('steady')).toBeNull();
    expect(within(drawer).getAllByText('none').length).toBeGreaterThan(0);
  });
});
