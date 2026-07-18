import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EquipmentColumn } from './EquipmentColumn';
import { createSimulation, type SimulationState } from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

afterEach(cleanup);

const base: SimulationState = createSimulation({ tankCapacity: 40 });

/** Stub of the sim hook: real state, a fresh vi.fn() per callback accessed. */
function stubSim(state: SimulationState): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    { state },
    {
      get(target: { state: SimulationState }, prop: string): unknown {
        if (prop === 'state') return target.state;
        if (!cache.has(prop)) cache.set(prop, vi.fn());
        return cache.get(prop);
      },
    }
  ) as unknown as ReturnType<typeof useSimulation>;
}

function renderColumn(sim: ReturnType<typeof useSimulation>, selectedDeviceId: string | null = null): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <EquipmentColumn sim={sim} selectedDeviceId={selectedDeviceId} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('EquipmentColumn', () => {
  it('lists every device and opens the first one by default', () => {
    renderColumn(stubSim(base));
    for (const name of ['Filter', 'Heater', 'Light', 'Air pump', 'ATO', 'Powerhead', 'Auto doser']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'Filter' })).toBeTruthy();
  });

  it('opens the inspector on the device carried in from a Systems tap', () => {
    renderColumn(stubSim(base), 'co2Generator');
    expect(screen.getByRole('heading', { name: 'CO₂ injector' })).toBeTruthy();
    expect(screen.getByText('Bubble rate')).toBeTruthy();
  });

  it('routes the inspector to whichever device row is clicked', () => {
    renderColumn(stubSim(base));
    fireEvent.click(screen.getByRole('button', { name: /Heater/ }));
    expect(screen.getByRole('heading', { name: 'Heater' })).toBeTruthy();
    expect(screen.getByText('Target')).toBeTruthy();
  });

  it('filters the device list by the search field', () => {
    renderColumn(stubSim(base));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search equipment' }), {
      target: { value: 'skimmer' },
    });
    expect(screen.getByText(/No device matches/)).toBeTruthy();
  });

  it('wires an inspector toggle to its update callback', () => {
    const sim = stubSim(base);
    renderColumn(sim);
    fireEvent.click(screen.getByRole('switch', { name: 'Filter enabled' }));
    expect(sim.updateFilterEnabled).toHaveBeenCalledWith(!base.equipment.filter.enabled);
  });
});
