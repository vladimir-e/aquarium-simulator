import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VitalsStrip } from './VitalsStrip';
import { createSimulation, type SimulationState } from '../../../simulation/index.js';
import { snapshotFromState } from '../../run';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function withAmmoniaPpm(ppm: number): SimulationState {
  // ammonia is stored as mass (mg); ppm = mass / water.
  return { ...base, resources: { ...base.resources, ammonia: ppm * base.resources.water } };
}

function renderStrip(state: SimulationState): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <VitalsStrip state={state} history={[snapshotFromState(state)]} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('VitalsStrip', () => {
  it('renders all eight vitals and derives ppm from mass', () => {
    renderStrip(withAmmoniaPpm(0.05));
    for (const label of ['NH₃', 'NO₂', 'NO₃', 'pH', 'O₂', 'CO₂', 'Temp', 'Water']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('0.050')).toBeTruthy();
  });

  it('raises a HIGH pill when ammonia crosses the alert threshold', () => {
    renderStrip(withAmmoniaPpm(0.2));
    expect(screen.getByText('HIGH')).toBeTruthy();
  });
});
