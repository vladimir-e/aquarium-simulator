import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { EquipmentColumn } from './EquipmentColumn';
import { createSimulation, type SimulationState } from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { UnitsProvider, useUnits, type UnitSystem } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import { toInternalTemperature } from '../../utils/units';

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

function ForceUnits({ system }: { system: UnitSystem }): null {
  const { unitSystem, setUnitSystem } = useUnits();
  useEffect(() => {
    if (unitSystem !== system) setUnitSystem(system);
  }, [system, unitSystem, setUnitSystem]);
  return null;
}

function renderColumn(
  sim: ReturnType<typeof useSimulation>,
  selectedDeviceId: string | null = null,
  units?: UnitSystem
): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        {units && <ForceUnits system={units} />}
        <EquipmentColumn sim={sim} selectedDeviceId={selectedDeviceId} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

const ALL_DEVICES = ['Filter', 'Heater', 'Light', 'Air pump', 'ATO', 'CO₂ injector', 'Powerhead', 'Auto doser'];

describe('EquipmentColumn', () => {
  it('lists all eight devices and opens the first one by default', () => {
    renderColumn(stubSim(base));
    for (const name of ALL_DEVICES) {
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

  it('keeps the selected device open even when a search hides it from the list', () => {
    renderColumn(stubSim(base));
    fireEvent.click(screen.getByRole('button', { name: /Powerhead/ }));
    expect(screen.getByRole('heading', { name: 'Powerhead' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search equipment' }), {
      target: { value: 'filter' },
    });
    // Row is filtered out of the list, but the inspector must not deselect it.
    expect(screen.queryByRole('button', { name: /Powerhead/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Powerhead' })).toBeTruthy();
    expect(screen.getByText('Flow rate')).toBeTruthy();
  });

  it('wires an inspector toggle to its update callback', () => {
    const sim = stubSim(base);
    renderColumn(sim);
    fireEvent.click(screen.getByRole('switch', { name: 'Filter enabled' }));
    expect(sim.updateFilterEnabled).toHaveBeenCalledWith(!base.equipment.filter.enabled);
  });

  it('round-trips the heater target through the display unit (°F → internal °C)', () => {
    const sim = stubSim(base);
    renderColumn(sim, 'heater', 'imperial');
    // Default 25°C shows as 77°F; +1 → 78°F, stored back as its Celsius value.
    const group = screen.getByRole('group', { name: 'Heater target temperature' });
    fireEvent.click(within(group).getByRole('button', { name: 'increase' }));
    expect(sim.updateHeaterTargetTemperature).toHaveBeenCalledWith(toInternalTemperature(78, 'imperial'));
  });

  it('wires the light schedule steppers to updateLightSchedule', () => {
    const sim = stubSim(base); // default light schedule { startHour: 8, duration: 10 }
    renderColumn(sim, 'light');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Light start hour' })).getByRole('button', { name: 'increase' })
    );
    expect(sim.updateLightSchedule).toHaveBeenCalledWith({ startHour: 9, duration: 10 });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Light duration' })).getByRole('button', { name: 'increase' })
    );
    expect(sim.updateLightSchedule).toHaveBeenCalledWith({ startHour: 8, duration: 11 });
  });

  it('respects the start-hour upper bound', () => {
    const atMax: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        light: { ...base.equipment.light, schedule: { startHour: 23, duration: 10 } },
      },
    };
    renderColumn(stubSim(atMax), 'light');
    const inc = within(screen.getByRole('group', { name: 'Light start hour' })).getByRole('button', {
      name: 'increase',
    }) as HTMLButtonElement;
    expect(inc.disabled).toBe(true);
  });

  it('wires the CO₂ schedule stepper to updateCo2GeneratorSchedule', () => {
    const sim = stubSim(base); // default CO₂ schedule { startHour: 7, duration: 10 }
    renderColumn(sim, 'co2Generator');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'CO₂ start hour' })).getByRole('button', { name: 'increase' })
    );
    expect(sim.updateCo2GeneratorSchedule).toHaveBeenCalledWith({ startHour: 8, duration: 10 });
  });
});
