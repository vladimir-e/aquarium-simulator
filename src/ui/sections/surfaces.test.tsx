import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { OverviewSection } from './OverviewSection';
import { WaterSection } from './WaterSection';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { renderStage, row } from '../test/stage';
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
