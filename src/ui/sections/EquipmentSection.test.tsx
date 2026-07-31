import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EquipmentSection } from './EquipmentSection';
import { UnitsProvider, useUnits, type UnitSystem } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { navFigures } from '../nav/figures.js';
import { emptyAggregates } from '../run/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, tick, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { RAIL_QUERY } from '../hooks/useMediaQuery';
import { toInternalTemperature } from '../utils/units';
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';
import { stubSim } from '../test/stubSim';

let media: MatchMediaStub;

// Desktop: the inspector opens beside the list rather than over it.
beforeEach(() => {
  media = stubMatchMedia((query) => query === RAIL_QUERY);
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function Address(): React.JSX.Element {
  return <span data-testid="address">{useLocation().pathname}</span>;
}

/** The reader's units come from their locale, so a units-sensitive test names one. */
function ForceUnits({ system }: { system: UnitSystem }): null {
  const { unitSystem, setUnitSystem } = useUnits();
  useEffect(() => {
    if (unitSystem !== system) setUnitSystem(system);
  }, [system, unitSystem, setUnitSystem]);
  return null;
}

function renderSection(
  path = '/equipment',
  sim: ReturnType<typeof useSimulation> = stubSim(base),
  units?: UnitSystem
): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        {units && <ForceUnits system={units} />}
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/equipment/:deviceId?"
              element={<EquipmentSection sim={sim} config={DEFAULT_CONFIG} />}
            />
          </Routes>
          <Address />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

function address(): string {
  return screen.getByTestId('address').textContent ?? '';
}

/** One arm of a named Stepper. */
function step(group: string, arm: 'increase' | 'decrease'): HTMLElement {
  return within(screen.getByRole('group', { name: group })).getByRole('button', { name: arm });
}

const ALL_ENTRIES = [
  'Filter',
  'Heater',
  'Light',
  'Air pump',
  'ATO',
  'CO₂ injector',
  'Powerhead',
  'Auto doser',
  'Biofilter',
];

describe('EquipmentSection', () => {
  it('lists the eight devices and the biofilter, and nothing else', () => {
    renderSection();
    // Exact, not merely present: the engine's device set is fixed, so an extra
    // row — an "add equipment" affordance, say — has to fail here.
    const names = screen.getAllByRole('link').map((link) => link.textContent ?? '');
    expect(names).toHaveLength(ALL_ENTRIES.length);
    ALL_ENTRIES.forEach((name, i) => expect(names[i]).toMatch(new RegExp(`^${name}`)));
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('reports the same figure the index rail carries for this section', () => {
    renderSection();
    const header = screen.getByRole('heading', { level: 1, name: 'Equipment' }).parentElement!;
    const railLine = navFigures({
      state: base,
      config: DEFAULT_CONFIG,
      presetName: 'Community',
      presetModified: false,
      units: 'metric',
      aggregates: emptyAggregates(),
    }).equipment.lines[0];
    expect(within(header).getByText(railLine)).toBeTruthy();
    expect(railLine).toBe('3 of 8 on · biofilter 0 %');
  });

  it('opens a device inspector at its own address', () => {
    renderSection();
    fireEvent.click(screen.getByRole('link', { name: /Heater/ }));

    expect(address()).toBe('/equipment/heater');
    expect(screen.getByRole('heading', { level: 3, name: 'Heater' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Heater target temperature' })).toBeTruthy();
  });

  it('opens the device named in the URL on a cold start', () => {
    renderSection('/equipment/co2Generator');
    expect(screen.getByRole('heading', { level: 3, name: 'CO₂ injector' })).toBeTruthy();
    expect(screen.getByText('Bubble rate')).toBeTruthy();
  });

  it('sends an unknown device back to the list', () => {
    renderSection('/equipment/skimmer');
    expect(address()).toBe('/equipment');
    expect(screen.getByRole('link', { name: /Filter/ })).toBeTruthy();
  });

  it('keeps the search query across a selection — the remount bug', () => {
    renderSection();
    const search = screen.getByRole('searchbox', { name: 'Search equipment' });
    fireEvent.change(search, { target: { value: 'er' } });
    expect(screen.queryByRole('link', { name: /Air pump/ })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: /Heater/ }));

    expect(screen.getByRole('heading', { level: 3, name: 'Heater' })).toBeTruthy();
    expect(screen.getByDisplayValue('er')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Air pump/ })).toBeNull();
  });

  it('keeps the open device open when a search hides its row', () => {
    renderSection('/equipment/powerhead');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search equipment' }), {
      target: { value: 'filter' },
    });
    expect(screen.queryByRole('link', { name: /Powerhead/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Powerhead' })).toBeTruthy();
  });

  it('says so when nothing matches the search', () => {
    renderSection();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search equipment' }), {
      target: { value: 'skimmer' },
    });
    expect(screen.getByText(/No device matches/)).toBeTruthy();
  });

  it('wires an inspector control to its update callback', () => {
    const sim = stubSim(base);
    renderSection('/equipment/filter', sim);
    fireEvent.click(screen.getByRole('switch', { name: 'Filter enabled' }));
    expect(sim.updateFilterEnabled).toHaveBeenCalledWith(!base.equipment.filter.enabled);
  });

  it('round-trips the heater target through the display unit (°F → internal °C)', () => {
    const sim = stubSim(base);
    renderSection('/equipment/heater', sim, 'imperial');
    // The default 25°C shows as 77°F; +1 stores 78°F back as its Celsius value.
    const group = screen.getByRole('group', { name: 'Heater target temperature' });
    expect(within(group).getByText('77°F')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'increase' }));
    expect(sim.updateHeaterTargetTemperature).toHaveBeenCalledWith(
      toInternalTemperature(78, 'imperial')
    );
  });

  it('wires both light schedule steppers to updateLightSchedule', () => {
    const sim = stubSim(base); // default light schedule { startHour: 8, duration: 10 }
    renderSection('/equipment/light', sim);
    fireEvent.click(step('Light start hour', 'increase'));
    expect(sim.updateLightSchedule).toHaveBeenCalledWith({ startHour: 9, duration: 10 });
    fireEvent.click(step('Light duration', 'increase'));
    expect(sim.updateLightSchedule).toHaveBeenCalledWith({ startHour: 8, duration: 11 });
  });

  it('stops the start hour at the end of the day', () => {
    const atMax: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        light: { ...base.equipment.light, schedule: { startHour: 23, duration: 10 } },
      },
    };
    renderSection('/equipment/light', stubSim(atMax));
    expect((step('Light start hour', 'increase') as HTMLButtonElement).disabled).toBe(true);
  });

  it('wires the CO₂ schedule stepper to updateCo2GeneratorSchedule', () => {
    const sim = stubSim(base); // default CO₂ schedule { startHour: 7, duration: 10 }
    renderSection('/equipment/co2Generator', sim);
    fireEvent.click(step('CO₂ start hour', 'increase'));
    expect(sim.updateCo2GeneratorSchedule).toHaveBeenCalledWith({ startHour: 8, duration: 10 });
  });

  it('reads the tank back at the device it belongs to', () => {
    renderSection('/equipment/heater', stubSim(base), 'metric');
    expect(screen.getByText('Water now')).toBeTruthy();
    expect(screen.getByText('25.0°C')).toBeTruthy();
    expect(screen.getByText('· at target')).toBeTruthy();
  });

  it('offers no settings for the biofilter, only its readings', () => {
    renderSection('/equipment/biofilter');
    expect(screen.getByRole('heading', { level: 3, name: 'Biofilter' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Colonisation')).toBeTruthy();
    expect(screen.getByText(/nothing to set here/)).toBeTruthy();
  });

  it('plots the day’s schedules against the hour the tank is on', () => {
    let evening = base;
    for (let hour = 0; hour < 20; hour++) evening = tick(evening, DEFAULT_CONFIG);
    renderSection('/equipment', stubSim(evening));

    const band = screen.getByRole('heading', { level: 2, name: 'Schedules' }).closest('section')!;
    expect(within(band).getByText('24 h · now 20:00')).toBeTruthy();
    expect(within(band).getByText('08:00–18:00 · 100 W')).toBeTruthy();
    expect(within(band).getByText('off · would dose at 08:00')).toBeTruthy();
  });
});
