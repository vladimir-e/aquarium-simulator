import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, within } from '@testing-library/react';
import { LifeSection } from './LifeSection';
import { OverviewSection } from './OverviewSection';
import { WaterSection } from './WaterSection';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { group, renderStage, row } from '../test/stage';
import { stocked } from '../test/run';
import { stubSim } from '../test/stubSim';

afterEach(cleanup);

/** Readings both surfaces draw under the same heading. */
const SHARED: [group: string, name: string][] = [
  ['Water', 'Temp'],
  ['Water', 'pH'],
  ['Nutrients', 'NO₃'],
];

describe('one tank, two surfaces', () => {
  it('reads a shared row the same on the Overview as on the Water module', () => {
    const run = stocked();
    const sim = stubSim(run.state, run.history);

    const rows = (section: React.JSX.Element): (string | null)[] => {
      renderStage(section);
      const text = SHARED.map(([group, name]) => row(group, name).textContent);
      cleanup();
      return text;
    };

    const overview = rows(<OverviewSection sim={sim} config={DEFAULT_CONFIG} />);
    expect(rows(<WaterSection sim={sim} config={DEFAULT_CONFIG} />)).toEqual(overview);
  });
});

/** Every roster row that speaks, as the reader hears it: `name — …, word`. */
function rosterRows(scope: HTMLElement): string[] {
  return within(scope)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => label.includes(' — ') && !label.includes('inspect'));
}

describe('one roster, two surfaces', () => {
  it('reads the same rows in the same words on the Life module and its widget', () => {
    const run = stocked();
    const sim = stubSim(run.state, run.history);

    renderStage(<OverviewSection sim={sim} config={DEFAULT_CONFIG} />);
    const widget = rosterRows(group('Life'));
    cleanup();

    renderStage(<LifeSection sim={sim} config={DEFAULT_CONFIG} />);
    const page = [...rosterRows(group('Fish')), ...rosterRows(group('Plants'))];

    expect(widget).toEqual(page);
    expect(widget).toHaveLength(3); // the neons, the algae, the anubias
  });

  it('rides the algae at the top of the plants on both', () => {
    const run = stocked();
    const sim = stubSim(run.state, run.history);

    renderStage(<OverviewSection sim={sim} config={DEFAULT_CONFIG} />);
    const widget = rosterRows(group('Life'));
    cleanup();

    renderStage(<LifeSection sim={sim} config={DEFAULT_CONFIG} />);
    const fish = rosterRows(group('Fish'));
    const plants = rosterRows(group('Plants'));

    expect(plants[0]).toMatch(/^Algae — /);
    expect(widget[fish.length]).toBe(plants[0]);
  });
});
